# Changelog

Todas as mudanças relevantes desta extensão são documentadas neste arquivo.

## 1.0.8

### Corrigido

- Seleção de texto entre células de tabela agora funciona (split por tabs/espaços e busca cada célula).
- Removido `<span>` em linhas de tabela (quebrava o HTML ao cruzar pipes). Notas em tabelas são acessíveis via chip no topo.

## 1.0.7

### Corrigido

- Variável `content` não definida no injection loop (causava texto `undefined` no span).
- Removido código morto (`attrEscape`, `wrapTableRow`).

## 1.0.6

### Corrigido

- `plainRaw.indexOf()` retornava posição no texto sem formatação → `startLine`/`endLine` errados nas notas. Agora mapeia via contexto de volta pro `fullText`.
- `String()` guard no `textContent` do painel de nota (evita `[object HTMLDivElement]`).

## 1.0.5

### Corrigido

- `findSelectedTextInDocument` com 5 estratégias: match exato, whitespace normalizado, strip Markdown do raw, linha por linha, word anchors.

## 1.0.4

### Alterado

- **Clique no chip de nota** → scroll até o destaque dentro do preview (não pula mais pro editor).
- **Clique no destaque** → abre tooltip customizado com o comentário + botão "Edit in editor".
- **Tooltip nativo (`title`)** substituído por tooltip customizado, mais rápido e estilizado.
- Só o botão "Edit in editor" no tooltip leva ao editor de texto.

## 1.0.3

- Imagens de demo do preview adicionadas ao README.

## 1.0.2

### Corrigido

- Prefixo de bloco Markdown e span do highlight agora na mesma linha, preservando estrutura de listas.

## 1.0.1

### Corrigido

- Highlight em linhas com prefixo Markdown (listas `-`, headings `#`, blockquotes `>`) não quebra mais a formatação. O span é injetado após o prefixo.
- Linhas de tabela (`|`) são ignoradas pelo highlight para evitar quebrar a estrutura da tabela.

## 1.0.0 (2026-07-17)

### Adicionado

- **Custom Editor Preview**: renderização de Markdown formatado com `marked` + syntax highlighting via `highlight.js`.
- **Anotações inline no preview**: selecionar texto no preview → painel de comentário → salvar nota sem sair do preview.
- **Destaque marca-texto**: trechos anotados aparecem com fundo amarelo semi-transparente (30% opacidade) no preview.
- **Toggle bar colapsável**: cards de notas pendentes no topo do preview, colapsados por padrão (`▸ N notes`).
- **Botão toggle na toolbar**: ícone `$(comment-discussion)` alterna entre editor de texto e preview customizado.
- **Tooltip no hover do destaque**: mostra o comentário da nota ao passar o mouse.

### Alterado

- Lógica pura de parsing/escrita de notas extraída para `src/notes-core.ts` (refactor interno).
- `src/extension.ts` reduzido de 535 para ~320 linhas (-43%).

## 0.0.22

### Alterado

- Ícone atualizado em PNG `256 × 256` para maior qualidade em telas de alta densidade.

## 0.0.21

### Alterado

- Ícone da extensão redesenhado com presença visual mais forte e proporcional.

## 0.0.20

### Adicionado

- Configuração `aiNotes.resolvedNoteAction` com as opções `delete` (padrão) e `convert-to-history`.
- `delete`: as instruções geradas orientam o agente a remover o bloco `## NOTE-XXX` resolvido.
- `convert-to-history`: as instruções geradas orientam o agente a mover o bloco para `# AI Notes History` como `## NOTE-XXX ✅`.
- As instruções de agentes recém-geradas refletem a configuração escolhida; blocos de instruções já existentes não são alterados (comportamento não retroativo).

## 0.0.19

### Corrigido

- Ao criar uma nota sem seleção, a extensão passa a usar a linha atual como referência.
- Comentários criados pelo botão `+` da gutter não são mais descartados quando a thread começa sem um range.
