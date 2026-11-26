# Plataforma: web, backend e sincronização

Decisões de arquitetura para tirar o Mercadin do "só no celular" e colocá-lo online, com
aplicação web e sincronização entre aparelhos. Este documento registra **o que foi decidido
e por quê**, inclusive as alternativas recusadas, para que a escolha não precise ser
redebatida a cada etapa.

Estado atual: app Expo offline-first, SQLite local, sem contas, sem servidor.

## Decisões

| Tema          | Decisão                                                 |
| ------------- | ------------------------------------------------------- |
| Backend       | ASP.NET Core (.NET) + PostgreSQL                        |
| Realtime      | SignalR, como aviso de mudança, não transporte de dados |
| Aplicação web | React + Vite + TypeScript, leitura e edição completas   |
| Sincronização | HTTP, baseada em cursor do servidor                     |
| Conflito      | Última escrita vence, no nível do registro              |
| Autenticação  | OAuth de terceiro (Google), sem senha própria           |
| Landing page  | HTML estático em `docs/`, publicado no GitHub Pages     |

## Por que SignalR não é a fundação

SignalR resolve "avisar o outro lado que algo aconteceu". Não resolve "os dois lados
discordam sobre o estado dos dados", que é o problema de verdade de um app offline-first.

Se o aparelho ficou três dias sem rede, não há conexão viva para receber evento nenhum. O
que precisa existir é um mecanismo de recuperação: o cliente pergunta "o que mudou desde o
ponto X" e o servidor responde. Esse mecanismo é obrigatório de qualquer forma, e, uma vez
pronto, ele sozinho já sincroniza.

Por isso o papel do SignalR aqui é deliberadamente pequeno: depois que um cliente envia
alterações, o servidor avisa os outros aparelhos **daquele mesmo usuário** que existe
novidade. Eles então fazem o `pull` normal, pelo mesmo caminho HTTP de sempre.

O payload do aviso é só um sinal, nunca os dados. Mandar os dados pelo hub criaria um
segundo caminho de escrita, que divergiria do primeiro assim que alguém corrigisse um bug
em apenas um deles.

## Pré-requisito: identificadores

O schema atual usa `INTEGER PRIMARY KEY AUTOINCREMENT`. Dois aparelhos offline criam
`id = 1` para compras diferentes, e qualquer tentativa de sincronizar junta registros que
não têm relação. **Nenhum trabalho de backend pode começar antes disso ser resolvido.**

Toda tabela sincronizável passa a ter:

| Coluna          | Tipo    | Função                                                   |
| --------------- | ------- | -------------------------------------------------------- |
| `id`            | TEXT    | UUID v7, gerado no cliente, único entre aparelhos        |
| `atualizado_em` | INTEGER | epoch em ms, UTC, usado para resolver conflito           |
| `excluido_em`   | INTEGER | nulo quando ativo, preenchido quando apagado (tombstone) |

**Tombstone**, e não `DELETE`, porque uma linha que some sem deixar rastro é
indistinguível de uma linha que o outro aparelho ainda não conhece: no próximo sync ela
seria recriada. Tombstones de mais de 90 dias podem ser removidos de vez.

Os `UNIQUE` de `mercados.nome` e `catalogo_itens.nome` passam a ser únicos **por usuário**,
não globais. Ao receber um nome que já existe, o servidor reaproveita o registro em vez de
rejeitar, usando a mesma normalização que `casarComCatalogo` já aplica no app.

Esta migração roda sobre dados reais. O backup JSON exportado é a rede de segurança, e o
caminho de volta é importar o backup em uma instalação limpa.

## Protocolo de sincronização

Uma única rota, que envia e recebe na mesma viagem:

```
POST /api/sync
{
  "cursor": 4821,
  "dispositivo": "uuid-do-aparelho",
  "alteracoes": { "compras": [], "itens": [], "mercados": [] }
}
```

```
{
  "cursor": 4907,
  "alteracoes": {},
  "rejeitados": []
}
```

O cursor é uma **sequência do servidor**, não um horário. Relógio de cliente atrasa,
adianta e é alterado pelo usuário; usar horário como marcador de progresso faz registros
sumirem silenciosamente. O horário do cliente serve apenas para decidir conflito.

### Conflito

Última escrita vence, comparando `atualizado_em`, com empate desfeito pelo id do
dispositivo (critério arbitrário, mas estável: os dois lados chegam ao mesmo resultado).

A resolução é **no nível do registro**, não do campo. A interface edita uma compra inteira
de uma vez, então mesclar campo a campo produziria estados que o usuário nunca viu, como o
mercado de uma edição com a data de outra.

**A compra é a unidade de sincronização, e os itens fazem parte dela.** Isto corrige uma
suposição errada da primeira versão deste documento, que previa fusão item a item.

O formulário de edição devolve a lista de itens inteira, sem identidade por linha: não
existe "editar o item 3", existe substituir a lista. Se dois aparelhos editarem itens
diferentes da mesma compra, os dois enviam uma lista completa, e a mais recente vence por
inteiro. Prometer fusão item a item seria prometer um resultado que a interface nunca
produz.

Um tombstone mais recente que uma edição vence: apagar é decisão mais forte que editar.

Os registros rejeitados voltam na resposta para que o cliente avise o usuário. Perder uma
edição em silêncio é pior que o conflito.

## Estrutura de pastas

```
mercadin/
├── apps/
│   ├── mobile/          o app Expo (hoje na raiz)
│   └── web/             React + Vite, aplicação autenticada
├── packages/
│   └── dominio/         tipos, cálculos, Zod, normalização de nomes
├── server/
│   ├── Mercadin.Api/    ASP.NET Core, endpoints e hub SignalR
│   └── Mercadin.Dados/  EF Core, migrações
└── docs/                landing page estática, GitHub Pages
```

A landing continua em `docs/` porque é o que o Pages serve sem build nenhum. A aplicação
web é outra coisa: entra autenticada, tem estado, e mora em `apps/web`.

### A ponte entre .NET e TypeScript

Escolher .NET no servidor custa o reuso do domínio: `calcularTotal`, validações Zod e
normalização de nomes estão em TypeScript e não atravessam para C#. Essas regras passam a
existir **dos dois lados**, e regra duplicada é regra que diverge.

Mitigações, nesta ordem:

1. O servidor expõe **OpenAPI**, e o cliente TypeScript é **gerado** (NSwag ou Kiota). Os
   tipos de transporte deixam de ser escritos à mão nos dois lugares.
2. O cálculo financeiro fica **em um lado só**. O servidor recebe os itens e calcula o
   total; o app calcula localmente para exibir enquanto offline, mas o valor do servidor
   prevalece ao sincronizar.
3. Os casos de teste de normalização de nome viram um **arquivo de dados compartilhado**,
   lido pelos testes Jest e pelos testes .NET. A implementação é duplicada; a definição do
   comportamento correto, não.

## Autenticação

Entrar com Google, via OIDC, e o servidor emitindo o seu próprio JWT. Sem senha própria.

Guardar senha significa hash, política de força, fluxo de recuperação, e-mail transacional
e um alvo de vazamento. Nada disso tem relação com controlar gasto de mercado.

O app guarda o refresh token no armazenamento seguro do sistema, não no SQLite.

## Privacidade e LGPD

Hoje o app não é alcançado por lei de proteção de dados, porque nada sai do aparelho. Com
backend isso muda: compras de supermercado de uma pessoa identificada são dado pessoal.

Passa a ser obrigatório:

- política de privacidade com URL pública, que a Play Store exige de qualquer forma
- exclusão de conta que apague os dados de verdade, não só desative
- a exportação que já existe, agora cumprindo também o direito de portabilidade

A promessa "100% offline e privado" **deixa de ser verdadeira** no momento em que existir
sincronização. O texto da landing e do app precisam mudar junto, dizendo que sincronizar é
opcional e que o modo offline continua existindo para quem não ativar.

## Fases

| #   | Entrega                                                      | Valor isolado                        |
| --- | ------------------------------------------------------------ | ------------------------------------ |
| 1   | UUID, `atualizado_em` e tombstones no app, migrando os dados | concluída, ver CHANGELOG             |
| 2   | API .NET com conta única, `POST /api/sync`, Postgres         | nenhum ainda, sem cliente            |
| 3   | App sincroniza                                               | backup automático, troca de aparelho |
| 4   | Aplicação web com leitura e edição                           | analisar e corrigir no computador    |
| 5   | SignalR avisando os outros aparelhos                         | conforto, não função nova            |

A fase 3 é a primeira que entrega algo ao usuário. As duas primeiras são investimento, e é
normal que pareçam lentas.

## Play Store

Decidir cedo, porque algumas coisas não voltam atrás:

- publicação é **AAB**, não APK
- a chave de upload precisa de backup seguro: perdê-la é perder a capacidade de atualizar
- `com.mercadin.app` se torna definitivo depois do primeiro envio
- política de privacidade e formulário de Segurança dos Dados passam a ser obrigatórios
- a permissão de câmera precisa de justificativa (leitura do cupom fiscal)
