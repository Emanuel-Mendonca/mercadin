# Roadmap

Marcos incrementais, cada um utilizável sozinho, não dependemos de "terminar tudo" para
ter valor entregue. A prioridade de cada item pendente está marcada como
**Must** (bloqueia o marco), **Should** (importante, não bloqueia) ou **Could** (se sobrar
tempo).

## MVP, entregue

Alguém consegue registrar compras reais e ver onde está economizando.

- [x] Registrar compra: mês, mercado, itens com quantidade e valor
- [x] Histórico com edição e exclusão
- [x] Resumo: gasto por mês e comparação de supermercados
- [x] Catálogo de itens com sugestão automática
- [x] Persistência local em SQLite
- [x] Exportar em JSON, CSV e PDF; importar backup JSON

## V1, uso diário e portfólio

- [x] Documentação open source completa
- [x] CI/CD: lint, typecheck e testes a cada push/PR
- [x] Identidade de marca: nome, logo e ícone (ver [BRANDING.md](./BRANDING.md))
- [x] Build de teste configurado (`eas.json` com perfis dev/preview/production)
- [x] Onboarding em 3 etapas na primeira abertura
- [x] Tela de abertura animada com progresso real de carregamento
- [x] **Must**, Testes cobrindo os repositórios SQLite. O SQL passou a rodar de verdade
      nos testes, contra o SQLite embutido no Node. A primeira execução já encontrou um
      `INSERT` quebrado que lint, typecheck e revisão não pegaram.
- [ ] **Should**, Testes cobrindo a store. Os repositórios já estão cobertos; falta a
      camada que os orquestra.
- [ ] **Must**, Atualizar as capturas de tela. As atuais são anteriores ao redesign e não
      mostram a aba Cupom nem as formas de pagamento.
- [ ] **Should**, Exercitar exportação e importação em aparelho real. Nunca foram testadas
      desde a migração para o SDK 57.
- [ ] **Should**, Revisar empty states e loading states em todas as telas
- [ ] **Should**, Rodar `eas build` de fato, com uma conta Expo
- [ ] **Could**, Dependabot e CodeQL revisados periodicamente

## V2, entregue fora da ordem prevista

Estes itens estavam planejados para marcos posteriores e foram antecipados:

- [x] **Leitura do cupom fiscal por QR Code** (NFC-e, Minas Gerais), preenche a compra a
      partir da nota. Estava previsto como V3.
- [x] Formas de pagamento cadastráveis (débito, crédito, vale refeição)
- [x] Catálogo organizado em 15 departamentos de supermercado
- [x] Preço médio por item, calculado do histórico real
- [x] Reconhecimento de item do catálogo ao ler o cupom, evitando duplicatas

## V2, pendente

- [ ] **Should**, Migrar `expo-file-system` da API `legacy` para a atual. Dívida técnica
      assumida na migração do SDK 57: a API legada funciona, mas será removida.
- [ ] **Could**, Gráfico de evolução de preço por item ao longo do tempo
- [ ] **Could**, Projeção de gasto do mês a partir da média dos anteriores. Cálculo
      simples sobre dado real, sem IA, se implementado, deve ser chamado de projeção e
      mostrar a base do cálculo.
- [ ] **Could**, Metas de gasto mensal com alerta ao se aproximar do limite
- [ ] **Could**, Edição em lote de itens
- [ ] **Could**, Múltiplas listas ou perfis (ex.: "casa" e "trabalho")
- [ ] **Could**, Widget de tela inicial com o gasto do mês

## V3, plataforma web e sincronização

Marco novo, decidido em outubro de 2026. As decisões de arquitetura, o protocolo de
sincronização e o tratamento de conflito estão em [PLATAFORMA.md](./PLATAFORMA.md).

- [x] **Must**, Identificadores UUID, `atualizado_em` e tombstones no SQLite, migrando os
      dados existentes. Bloqueava todo o resto: com `AUTOINCREMENT`, dois aparelhos criam o
      mesmo id para registros diferentes.
- [ ] **Must**, API em ASP.NET Core com PostgreSQL, conta única e a rota `POST /api/sync`
- [ ] **Must**, App sincronizando. Primeira entrega do marco com valor visível: backup
      automático e troca de aparelho sem exportar JSON na mão.
- [ ] **Must**, Política de privacidade publicada e exclusão de conta que apague os dados
- [ ] **Should**, Aplicação web em React com leitura e edição completas
- [ ] **Should**, SignalR avisando os outros aparelhos do mesmo usuário após um envio
- [ ] **Could**, Modo compartilhado entre duas pessoas da mesma casa

## V4, longo prazo

- [ ] Leitura de cupom em outros estados. Cada UF tem portal e HTML próprios; hoje só MG.
- [ ] Publicação na Google Play, com pacote AAB e chave de distribuição
- [ ] Sugestão de qual mercado visitar, com base no histórico de preços por item
- [ ] Internacionalização de moeda e idioma

## Fora de escopo

| Item                                               | Motivo                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Marketplace ou integração com apps de supermercado | Foge do propósito de controle pessoal de gastos                                                      |
| Previsão de preços por IA                          | O app não tem dado nem infraestrutura para isso, e anunciar previsão sem cálculo real seria enganoso |

### Decisões revertidas

Dois itens saíram de "Fora de escopo" em outubro de 2026, e o registro fica aqui porque
apagar a decisão anterior esconderia que ela existiu.

| Item                                       | Motivo original                                         | Por que mudou                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Autenticação e contas de usuário           | contraria a proposta local-first                        | a conta passa a ser o que liga os aparelhos, e o modo offline continua existindo para quem não ativar a sincronização |
| Sincronização em nuvem com backend próprio | custo de servidor incompatível com projeto de portfólio | o projeto deixou de ser só portfólio e virou ferramenta de uso diário, com aplicação web prevista                     |

O custo de servidor continua sendo um risco real, não resolvido: ele apenas passou a ser
aceito conscientemente.

## Como este documento é mantido

Revisado a cada marco concluído. Itens que mudam de prioridade ou saem do escopo são
atualizados aqui, e a mudança relevante é registrada no
[CHANGELOG.md](../../CHANGELOG.md).
