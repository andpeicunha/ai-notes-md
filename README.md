# SDD AI Notes

> Spec-Driven Development: annotate Markdown files for AI agents.

Select text in any `.md` file, add an AI note, and the extension appends a structured annotation that AI agents can read and act on. All notes live inside the Markdown file itself — no sidecars, no databases.

## Creating a note

![Creating a note](media/demo-create.gif)

## Reviewing the result

![Reviewing the result](media/demo-review.gif)

## Features

- **Inline note creation** via VS Code's native Comments UI
- **Gutter markers** on annotated lines with hover preview and quick-jump links
- **Auto-generated `# AI Notes` section** with agent instructions
- **Resolution workflow** — agents convert resolved notes into historical records instead of deleting them
- **en-US / pt-BR** — UI labels auto-switch with VS Code language; generated Markdown stays in English for stable AI parsing

## Workflow

1. Open a `.md` file.
2. Select a text fragment.
3. Click the `$(comment-discussion-sparkle)` CodeLens icon, right-click and choose **Add AI Note**, or run **AI Notes: Add Note** from the Command Palette.
4. Type your note in the inline comment box.
5. Press `Ctrl+Enter` / `Cmd+Enter` or click **Save AI Note**.

The note is appended at the end of the file inside an `# AI Notes` section (created automatically if missing).

## Generated Format

```md
# AI Notes

## Instructions for AI Agents

When analyzing this document, treat every note with `Status: pending` as an active request.

After resolving a note:
1. Do not delete it.
2. Convert it into a short historical record.
3. Change the heading to `## NOTE-XXX ✅`.
4. Keep the resolved note inside this `# AI Notes` section.

## NOTE-001

Status: pending
Lines: 42-48
Selected Text:
> The system must validate the token before loading user data.
Human Comment:
This rule must also support B2B tenant-based authentication.
Expected AI Action:
Not specified.
Created At:
2026-05-13 10:30
```

## Resolution Workflow

Once an AI agent resolves a note, it converts the note into a historical record:

```md
## NOTE-001 ✅

**Question:** "What does this section mean?"
**Answer:** The callback route is `/auth/done`.
```

Resolved notes lose their `Status: pending` field, so the extension stops showing gutter markers for them.

---

## 🇧🇷 Português

**SDD AI Notes** — Spec-Driven Development: anotações Markdown para agentes de IA.

Selecione um trecho em qualquer arquivo `.md`, adicione uma nota de IA, e a extensão anexa uma anotação estruturada que agentes de IA conseguem ler e processar. Tudo fica dentro do próprio Markdown — sem arquivos auxiliares, sem banco de dados.

### Como usar

1. Abra um arquivo `.md`.
2. Selecione um trecho de texto.
3. Clique no ícone `$(comment-discussion-sparkle)`, clique com botão direito → **Add AI Note**, ou use o Command Palette: **AI Notes: Add Note**.
4. Escreva a nota na caixa de comentário inline.
5. Pressione `Ctrl+Enter` / `Cmd+Enter` ou clique em **Save AI Note**.

A nota é anexada no fim do arquivo dentro de uma seção `# AI Notes` (criada automaticamente se não existir). Notas pendentes exibem um marcador na gutter com hover preview e link para a nota completa.

### Fluxo de resolução

Quando um agente de IA resolve uma nota, ele não a deleta — converte em um registro histórico com `## NOTE-XXX ✅`. Notas resolvidas perdem o `Status: pending` e os marcadores somem.

Os rótulos da interface seguem o idioma do VS Code (en-US / pt-BR). A estrutura Markdown gerada permanece em inglês para manter a interpretação estável por IAs.

---

## Notes

- Works only with `.md` files.
- The Markdown file is the source of truth — no JSON sidecars, no databases, no hidden storage.
- Note creation uses VS Code's native Comments API, keeping the editor close to the selected line.
