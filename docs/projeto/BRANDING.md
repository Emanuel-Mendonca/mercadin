# Identidade de Marca, Mercadin

<div align="center">

<img src="../screenshots/vortex-icon.png" alt="Logo do Mercadin" width="160">

**A logo oficial: anel orbital aberto envolvendo um carrinho de compras.**

</div>

## Aplicações

<div align="center">

|                              Ícone do app                               |                                       Ícone adaptativo                                       |                                   Splash                                   |                               Favicon                                |
| :---------------------------------------------------------------------: | :------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------: | :------------------------------------------------------------------: |
| <img src="../../src/ui/assets/icon.png" alt="Ícone do app" width="110"> | <img src="../../src/ui/assets/adaptive-icon.png" alt="Ícone adaptativo Android" width="110"> | <img src="../../src/ui/assets/splash.png" alt="Splash screen" width="110"> | <img src="../../src/ui/assets/favicon.png" alt="Favicon" width="60"> |
|                           Launcher do celular                           |                                Máscara do Android, sem fundo                                 |                              Abertura do app                               |                           Aba do navegador                           |

</div>

## Nome

**Mercadin**

- **Vem de Minas.** Em Minas Gerais, "mercadin" é como se chama, com carinho, o comércio
  perto de casa: o mercado da esquina, o do bairro, aquele em que o dono conhece o cliente
  pelo nome. O diminutivo ali não fala de tamanho, fala de proximidade e de afeto. Foi esse
  apelido do dia a dia que batizou o app.
- **Coloca o app no lugar certo.** "Vou ali no mercadin" é exatamente a situação de uso:
  celular na mão, no corredor, registrando a compra enquanto ela acontece. O nome não
  descreve um software, descreve o momento em que o software serve para alguma coisa.
- **Honesto sobre o alcance.** A leitura de cupom fiscal funciona com a SEFAZ de Minas
  Gerais, e só com ela, porque o app nasceu em Minas e foi feito primeiro para quem compra
  aqui. Cada estado publica a nota eletrônica em um portal próprio, com endereço e layout
  próprios, então suporte a outros estados é trabalho novo, não configuração. Um nome
  mineiro diz isso antes da primeira tela. Os valores são em real e as datas no formato
  brasileiro pelo mesmo motivo.

> **Nota de transição.** O projeto se chamou **Vortex Cart** até outubro de 2026. O nome
> anterior pode aparecer em entradas antigas do [CHANGELOG](../../CHANGELOG.md), que são
> registro histórico e não devem ser reescritas.

## Conceito do símbolo

Um anel aberto (não é um círculo fechado) envolvendo um carrinho de compras minimalista.

- **O carrinho no centro** é literal e direto: não deixa dúvida sobre do que o app trata,
  mesmo à distância ou em tamanho pequeno (favicon, ícone de launcher).
- **O anel** emoldura e dá foco, funcionando como a borda de uma etiqueta ou de um selo.
- **A abertura no anel** evita o peso de um círculo fechado e deixa a forma mais leve.
- A paleta clara sobre fundo noturno faz o símbolo se destacar no escuro.

> **O símbolo foi desenhado para o nome anterior.** O anel representava o "vórtice" que
> dava nome ao app, e essa leitura não se aplica mais a "Mercadin". A forma continua
> funcionando como moldura do carrinho, mas se um dia a identidade for revista, o anel é o
> primeiro elemento a questionar: hoje ele é decoração, não significado.

## Direção visual: atmosférica / cósmica / glassmorphism

A identidade evoluiu de um estilo flat/bold (blocos sólidos, bordas pretas grossas) para uma
linguagem **atmosférica**: superfícies translúcidas com desfoque (glassmorphism), glows
coloridos suaves ao fundo, anéis orbitais finos, e sombras com cor (em vez de sombra dura
preta). Os anéis girando ao redor do mockup na landing page e na tela de abertura são a extensão
animada do próprio símbolo.

## Cores

Os dois temas estão centralizados em `src/ui/theme/tokens.ts`. O escuro vem de um esquema
Material Design 3 completo. O claro é a paleta "Kinetic Violet Modernist": superfícies frias
e quase brancas com tinta violeta-carvão, pontuadas por violeta elétrico.

| Token                    | Uso                                 | Escuro (padrão)       | Claro                       |
| ------------------------ | ----------------------------------- | --------------------- | --------------------------- |
| `primary`                | Botões primários, ênfase, glow      | Lavanda `#CCBFF7`     | Violeta elétrico `#4934C2`  |
| `accent`                 | Selos, destaques ("mais econômico") | Dourado `#D3C87C`     | Menta de precisão `#005A48` |
| `background`             | Fundo geral                         | Noturno `#10131B`     | Canvas `#FBF8FF`            |
| `surface` / `surfaceAlt` | Cards, superfícies elevadas         | `#1D1F28` / `#272A32` | `#FFFFFF` / `#F4F2FF`       |
| `text`                   | Texto principal                     | `#E1E2EE`             | Violeta-carvão `#191B28`    |
| `border`                 | Bordas e contornos                  | `#938F99`             | `#C8C4D7`                   |

O dourado do tema escuro não sobrevive sobre fundo claro, o contraste é insuficiente, então
no claro o papel de destaque passa para a menta.

O tema escuro continua sendo a "assinatura" visual da marca, é nele que o glow, os anéis
orbitais e o glassmorphism aparecem com mais força. O claro não é um rebaixamento do escuro:
é uma paleta desenhada à parte, para leitura em ambiente iluminado. A escolha fica com o
usuário em **Itens → Aparência** (claro, escuro ou o do sistema) e é gravada no banco local.

## Variações

1. **Ícone do app** (`src/ui/assets/icon.png`): logo oficial (anel aberto + carrinho) em tom
   claro sobre fundo noturno, cantos arredondados, pronto para launcher de celular.
2. **Ícone adaptativo Android** (`src/ui/assets/adaptive-icon.png`): apenas o símbolo, sem
   fundo (transparente), extraído da logo oficial para compor com a máscara adaptativa do
   Android.
3. **Splash screen** (`src/ui/assets/splash.png`): mesmo símbolo, centralizado sobre fundo
   noturno em formato retrato.
4. **Monocromático** (favicon, impressão em P&B): a logo já funciona nativamente em uma cor
   só (claro sobre escuro), é a sua forma padrão, sem necessidade de uma versão separada.
5. **Wordmark**: "Mercadin" em Raleway/Space Grotesk, em lavanda,
   sobre fundo escuro translúcido (ver cabeçalho de `docs/index.html`).

Os arquivos em `src/ui/assets/` foram gerados automaticamente a partir da logo oficial
(recorte, remoção de fundo para a versão adaptativa, e recomposição para o splash), já é a
versão definitiva para uso no app, não um placeholder.

## Prompt para geração por IA (para novas variações/composições futuras)

Caso precise gerar composições adicionais no mesmo estilo (banners, ilustrações, materiais de
divulgação) mantendo a linguagem visual da logo:

```
Minimalist app icon logo, an open circular ring (orbit-like, with a gap) encircling a simple
shopping cart glyph, thin rounded line strokes, light lavender-white color (#E4E5F1) on a
dark night background (#10131B), soft atmospheric glow allowed, centered composition,
clean geometric style similar to modern Material You / premium app icons, square 1:1
aspect ratio, no text, no letters
```

Ajustes úteis a pedir em iterações seguintes: "thicker/thinner ring stroke", "larger gap in
the ring", "add subtle glow", "different cart icon style (filled vs outline)".

## Atualização do roadmap

Este documento resolve o item "Nome, logo e ícone do app" listado como **Must have** no
[ROADMAP.md](./ROADMAP.md) (V1), nome, símbolo,
paleta e ícone final já estão definitivos e aplicados em todo o app e na landing page
(`docs/index.html`). Um SVG vetorial da logo (em vez do PNG atual) fica como possível
refinamento futuro, mas não bloqueia mais nada.
