# Changelog

Todas as mudanças relevantes desta extensão são documentadas neste arquivo.

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
