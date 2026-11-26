# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o projeto
segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Alterado (abertura do app)

- A splash nativa deixa de mostrar imagem e fica só com a cor de fundo, acompanhando o
  esquema claro ou escuro do aparelho (`#FBF8FF` e `#10131B`, os mesmos fundos da
  `TelaAbertura`). O usuário passa a ver uma abertura só, não duas em sequência
- Antes a splash nativa era preta e exibia `splash.png`, uma imagem retrato de 1242x2436
  encolhida para 200px de largura, o que aparecia como um retângulo escuro no meio de uma
  tela preta, sem relação com a tela animada que vinha logo depois
- `src/ui/assets/splash.png` removido, não é mais usado por nada
- A imagem configurada passou a ser um PNG 1x1 transparente, e não a ausência de imagem,
  porque o plugin aponta `windowSplashScreenAnimatedIcon` para `@drawable/splashscreen_logo`
  de qualquer forma: sem arquivo, o recurso não é gerado e a referência órfã quebra o build
- Limitação conhecida: a splash nativa segue o tema do **sistema**, não a preferência
  gravada no app. Quem forçar o tema oposto ao do aparelho vê uma troca de cor no primeiro
  instante. A preferência mora no SQLite e só pode ser lida depois que o JavaScript sobe

### Corrigido (bug que nenhuma checagem pegava)

- `INSERT OR IGNORE INTO catalogo_itens (nome, categoria) VALUES (??)`, em três lugares.
  Faltava a vírgula entre os dois marcadores, o que quebrava o cadastro de item no
  catálogo e a semente de um banco novo. Veio do passe de ortografia que removeu
  travessões: o padrão que tirava vírgula antes de pontuação também comeu a de
  `VALUES (?, ?)`. Lint, typecheck e testes passavam, porque SQL é string

### Adicionado (fase 1 da sincronização: identidade dos registros)

- Schema v2: chave primária em **UUID v7** gerado no aparelho, no lugar de
  `INTEGER PRIMARY KEY AUTOINCREMENT`. Dois aparelhos offline criavam `id = 1` para
  compras diferentes, o que inviabilizava qualquer sincronização
- Colunas `atualizado_em` e `excluido_em` em toda tabela sincronizável. A exclusão passa a
  ser lógica (tombstone): uma linha que some sem rastro é indistinguível de uma que o
  outro aparelho ainda não conhece, e voltaria no sync seguinte
- Unicidade de nome virou **índice parcial** (`WHERE excluido_em IS NULL`). Com `UNIQUE` na
  coluna, um registro excluído continuaria ocupando o nome para sempre
- `migracaoSync.ts`: conversão do v1 para o v2 preservando os dados. Lê tudo para a
  memória antes de derrubar qualquer tabela, e roda em transação, então falha inteira ou
  não falha. O carimbo de sincronização de cada compra vem do histórico real
  (`updated_at ?? created_at`), não do momento da migração
- `uuid.ts`: gerador de UUID v7 escrito como função pura, testável sem módulo nativo.
  Dependência nova: `expo-crypto`, para a entropia do sistema
- **Testes dos repositórios SQLite**, usando o `node:sqlite` embutido no Node como
  implementação do `expo-sqlite`. O SQL executa de verdade, com a mesma gramática do
  aparelho, então erro de sintaxe e violação de chave estrangeira quebram o teste. 27
  casos novos, incluindo a migração e o seu rollback

### Alterado

- A compra passa a ser a **unidade de sincronização**, com os itens fazendo parte dela. O
  formulário substitui a lista inteira ao editar, então fusão item a item prometeria um
  resultado que a interface nunca produz. `PLATAFORMA.md` foi corrigido, ele previa o
  contrário
- Identificadores de domínio passaram de `number` para `string` em toda a camada de dados,
  na store e nas telas
- Removidos imports mortos de `useRef` em quatro componentes, sobra da troca por `useState`

### Adicionado (plataforma web, backend e sincronização)

- `docs/projeto/PLATAFORMA.md`: decisões de arquitetura para a fase online. Backend em
  ASP.NET Core com PostgreSQL, aplicação web em React com leitura e edição completas,
  sincronização por HTTP com cursor do servidor e SignalR restrito ao aviso de mudança
- ROADMAP: novo marco "V3, plataforma web e sincronização", com a migração de
  identificadores como pré-requisito bloqueante
- ROADMAP: "Autenticação e contas de usuário" e "Sincronização em nuvem com backend
  próprio" saíram de "Fora de escopo". A reversão ficou registrada com o motivo original e
  o motivo da mudança, em vez de as linhas serem apagadas

### Alterado (landing page reorganizada)

- Hero em duas colunas, métricas do projeto, seção de instalação, banner da plataforma web
  e rodapé em grade. CSS continua escrito à mão em `docs/assets/css/landing.css`, sem
  framework por CDN
- A seção de instalação diz que **não existe release publicada**, porque não existe: o
  repositório não tem nenhuma tag. O caminho atual é compilar pelo GUIA
- Registrada a ressalva de que o pacote local tem cerca de 58 MB, roda em arm64 e é
  assinado com a chave de depuração, não é pacote de distribuição
- Funcionalidades passam a incluir a leitura de cupom fiscal por QR Code, com a limitação
  a Minas Gerais dita na própria descrição
- Título do hero deixa de ser "organizadas em órbita": a figura vinha do nome anterior

### Alterado (renomeação do projeto)

- O app passa a se chamar **Mercadin**. Nome, slug, scheme, identificador
  (`com.vortexcart.app` para `com.mercadin.app`), textos de interface, documentação e
  landing page foram atualizados
- As entradas antigas deste arquivo mantêm o nome "Vortex Cart": são registro do que
  aconteceu na época e reescrevê-las falsificaria o histórico
- A troca do identificador faz o Android tratar a nova versão como outro app: a
  atualização não preserva os dados, e é preciso exportar o backup JSON antes de instalar
  e importá-lo em seguida
- O símbolo (anel aberto com carrinho) foi mantido sem alteração

### Removido (limpeza de arquivos e pastas sem uso)

- `app/index.tsx` e `app/layout.tsx`: arquivos vazios (0 bytes) que o Expo Router registrava
  como rotas mesmo assim, o primeiro colidia com `app/(tabs)/index.tsx` (ambos resolvem
  para `/`) e o segundo criava uma rota `/layout` sem `export default` (o layout real é
  `app/_layout.tsx`, com underscore)
- Pastas `src/contexts`, `src/features`, `src/hooks` e `src/navigation`: existiam vazias, só
  com `.gitkeep`, "reservadas para o futuro". Nenhuma é prevista no diagrama do
  `ARCHITECTURE.md`, e `src/navigation` contradizia a navegação file-based do `app/`
- `.gitkeep` de `components/`, `screens/`, `services/`, `storage/` e `utils/`, essas pastas
  já têm código, o arquivo não fazia mais nada
- Dependência `expo-secure-store` e seu plugin no `app.config.ts`: nenhum import no projeto
- Aliases de path `@/hooks`, `@/navigation` e `@/features` em `tsconfig.json` e
  `babel.config.js`, apontavam para as pastas vazias removidas acima

### Alterado (landing page, CSS separado do HTML)

- CSS extraído de `docs/index.html` para `docs/assets/css/landing.css`, organizado em seções
  numeradas com sumário no topo. Os `style=` inline também saíram: os glows viraram
  `.glow--1/2/3` e o tamanho de ícone virou `.icon-inline`
- Regras `.soon` e `.icon-inline-sm` removidas junto com o selo "Build em breve" que saiu do
  HTML, não eram mais referenciadas por nenhum elemento
- `docs/index.html` continua sendo o nome do arquivo de entrada porque é o que o GitHub Pages
  serve por padrão, renomear para `landing.html` quebraria o site publicado
- `README.md`: as capturas de tela agora são imagens de verdade, apontando para os arquivos
  corretos (`1_nova_compra.png`…) em vez dos caminhos placeholder inexistentes
  (`nova-compra.png`…); a árvore de `src/` passou a listar `assets/` e `constants/`

### Adicionado (redesign completo das 4 telas)

- **Categorias no catálogo**: nova coluna `categoria` em `catalogo_itens` (migração de
  schema), com 6 categorias fixas (Mercearia, Hortifruti, Laticínios, Bebidas, Limpeza,
  Outros), filtro por categoria e ícone por categoria em toda a UI
- **Preço médio por item**: nova query `getPrecoMedioPorItem`, calculada a partir do
  histórico real de compras, mostrada no catálogo
- **Nova Compra**: modelo de "inserção rápida" (compõe um item por vez e insere na lista,
  em vez de várias linhas editáveis simultâneas), resolve também o problema antigo de
  campos apertados em telas estreitas
- **Histórico**: busca por mercado/produto, card de total do período (real, sem métricas
  inventadas)
- **Resumo**: gráfico de barras com gradiente e sparkline (SVG), comparação percentual com
  o mês anterior, barra de progresso por mercado
- Novos componentes reutilizáveis: `AmbientGlow` (glow atmosférico) e `Toast` (feedback não
  bloqueante), usados nas 4 telas
- Dependência nova: `expo-linear-gradient` (gradientes em botões, barras e progresso)
- Adaptações conscientes em relação aos mockups de referência: sem blur de fundo real (RN
  não suporta nativamente), sem métricas fabricadas ("economia estimada", metas fixas),
  toda métrica exibida vem de dado real

### Alterado (logo oficial adotada)

- Ícone, ícone adaptativo, splash e favicon substituídos pela logo oficial (anel orbital
  aberto + carrinho de compras), fornecida pelo usuário, deixam de ser placeholder
- `docs/index.html`: emojis trocados por ícones de interface (Material Symbols Outlined),
  e o aviso sobre a versão web reescrito em linguagem menos técnica
- `BRANDING.md` atualizado com o conceito do novo símbolo

### Adicionado (Fase 6, Branding)

- Nome definitivo: **Vortex Cart**, aplicado em `app.config.ts`, `package.json`, docs e
  templates do GitHub
- `BRANDING.md`: conceito do símbolo (vórtice de 3 braços), variações de logo e prompt de
  geração por IA

### Alterado (rebrand cósmico, paleta lavanda/dourado)

- Paleta trocada de roxo elétrico/lima/preto (flat, bordas grossas) para uma identidade
  atmosférica derivada de um esquema Material Design 3: lavanda `#CCBFF7` / dourado `#D3C87C`
  / fundo noturno `#10131B`, com tema claro derivado dos tokens `inverse-*` do próprio M3
- `Card` e `Button` (variante primária) passaram a usar sombra suave colorida (glow) em vez
  da sombra dura sólida anterior
- `docs/index.html` (landing page) redesenhada com glassmorphism, glows ambientes e anéis
  orbitais animados, mantendo conteúdo 100% real (sem copy genérico de e-commerce)
- Ícone, ícone adaptativo e splash regenerados com o novo vórtice (glow lavanda + núcleo
  dourado sobre fundo noturno)

### Adicionado (Fase 4, Documentação)

- README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, ROADMAP, BACKLOG (MoSCoW),
  TESTPLAN, ARCHITECTURE, STYLEGUIDE, SUPPORT
- Templates de issue/PR, CODEOWNERS e FUNDING.yml

### Adicionado (Fase 5, CI/CD e qualidade)

- GitHub Actions: `ci.yml` (lint, typecheck, testes), `release.yml` (releases automáticas
  por tag), `codeql.yml` (análise de segurança semanal)
- Dependabot para npm e GitHub Actions
- Configuração do VS Code (`settings`, `tasks`, `launch`, `extensions`)
- `jest.config.js` e primeiros testes unitários reais (moeda, datas, cálculo de total)

### Corrigido (encontrado ao instalar e rodar de verdade, não só checagem estática)

- `src/theme/theme.ts` e `tokens.ts`: tipo `Theme.colors` estava travado nos valores literais
  do tema claro, rejeitando o tema escuro no `tsc`; corrigido com uma interface `ColorPalette`
  explícita
- `src/services/importService.ts`: acesso a `resultado.assets[0]` sem checar `undefined`
- `calcularTotal` extraído de `storage/comprasRepository.ts` para `utils/totals.ts`, uma
  função pura, para poder ser testada sem depender do `expo-sqlite`
- `eslint-import-resolver-typescript` fixado na versão `3.6.1`, versões mais novas conflitam
  de peer dependency com o restante do ecossistema Expo/typescript-eslint 7.x
- `@types/jest` adicionado (faltava para o `tsc` reconhecer `describe`/`it`/`expect`)

## [0.1.0], Fase 1 a 3

### Adicionado

- Scaffold do projeto: Expo + TypeScript + Expo Router, ESLint/Prettier/Husky/Commitlint
- Design tokens e tema claro/escuro (paleta roxo `#4F1FFF` / lima `#D8F33D` / preto,
  tipografia Raleway)
- Banco de dados SQLite local com schema relacional (mercados, compras, itens, catálogo)
- Store Zustand orquestrando toda a persistência
- 4 telas: Nova Compra, Histórico, Resumo, Itens, com navegação em abas
- Formulário de nova compra com React Hook Form + validação Zod
- Comparação de supermercados pelo valor médio por compra, com selo de "mais econômico"
- Exportação de dados em JSON, CSV e PDF, com compartilhamento nativo
- Importação de backup JSON (aditiva, não destrutiva)
- Guia de implementação e publicação no GitHub (`IMPLEMENTACAO.md`)

[Não lançado]: https://github.com/Emanuel-Mendonca/mercadin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Emanuel-Mendonca/mercadin/releases/tag/v0.1.0
