# Contributing to SDD AI Notes

## Development

Install dependencies:

```sh
npm install
```

Compile:

```sh
npm run compile
```

Run locally:

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a `.md` file, select text, and click the CodeLens icon.

Package a local VSIX:

```sh
vsce package
```

Install the generated `.vsix` through `Extensions -> ... -> Install from VSIX...`.

When shipping a new local build, bump the `version` in `package.json` and `package-lock.json` before packaging so VS Code treats it as an update.

## Architecture

The extension is a single-file VS Code extension (`src/extension.ts`) with no external runtime dependencies.

### Commands

- `aiNotes.addNote`
- `aiNotes.addNoteFromContext`
- `aiNotes.addNoteFromCodeLens`
- `aiNotes.submitInlineNote`
- `aiNotes.discardInlineNote`
- `aiNotes.revealNote`

### Design Decisions

**The Markdown file is the only source of truth.** Do not introduce JSON sidecars, SQLite, hidden metadata, or external storage unless the product direction changes.

**Comments API.** The extension uses VS Code's native Comments API for note creation. This gives the best inline UX available in VS Code and keeps the editor close to the selected line.

**CodeLens.** The CodeLens action uses the Codicon `$(comment-discussion-sparkle)` with a translated tooltip. CodeLens icons are rendered by VS Code, so extensions cannot force icon color, icon size, custom SVGs, React icons, or CSS styling there. If future work needs a larger/yellow clickable element, it would require a different UI approach (inline decoration or gutter decoration).

**Gutter markers.** Pending-note gutter markers use a custom SVG at `media/note-pending.svg`. The marker is intentionally shown only on the first line of a multi-line note range to avoid repeated icons for the same note.

**Inline comment input.** The inline comment input height and focus behavior are controlled by VS Code's Comments API. The extension can set `prompt`, `placeHolder`, commands, and keybindings, but cannot force the comment editor to exactly two lines. The current implementation uses the native `workbench.action.addComment` flow.

**Keybindings.** `Ctrl+Enter` and `Cmd+Enter` are contributed for `editor.action.submitComment` when the AI Notes comment editor is focused.

**Internationalization.** UI strings are English by default and Portuguese when `vscode.env.language` starts with `pt`. The generated Markdown field names remain in English to keep AI parsing stable.
