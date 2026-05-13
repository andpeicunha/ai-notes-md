# AI Notes for Markdown

Lightweight VS Code extension for adding AI-friendly annotations directly inside Markdown files.

## Workflow

1. Open a `.md` file.
2. Select a text fragment.
3. Click the `comment-discussion-sparkle` CodeLens icon that appears above the selected line, right-click and choose `Add AI Note`, or run `AI Notes: Add Note` from the Command Palette.
4. Enter the note comment in the inline VS Code comment box.
5. Click `Save AI Note`, or press `Ctrl+Enter` / `Cmd+Enter`.

The note is appended at the end of the current Markdown file. If the file does not already have an `# AI Notes` section, the extension creates it automatically.
The section also includes instructions telling AI agents to convert resolved notes into historical records instead of deleting them.

Pending notes are also shown back on their original lines:

- A gutter marker appears next to the first annotated line.
- Hovering the marker shows the human comment and expected AI action.
- The hover includes an `Open note` link that jumps to the full note block.

## Generated Format

```md
---

# AI Notes

## Instructions for AI Agents

When analyzing this document, treat every note with `Status: pending` as an active request.

After resolving a note, do not delete it. Convert it into a short historical record, change the heading to `## NOTE-XXX ✅`, and keep it inside this `# AI Notes` section. Unresolved notes must remain unchanged with `Status: pending`.

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

## Design Notes for Future Agents

The Markdown file is the only source of truth. Do not introduce JSON sidecars, SQLite, hidden metadata, or external storage unless the product direction changes.

The extension currently uses VS Code's native Comments API for note creation. This gives the best inline UX available in VS Code and keeps the editor close to the selected line. The extension contributes:

- `aiNotes.addNote`
- `aiNotes.addNoteFromContext`
- `aiNotes.addNoteFromCodeLens`
- `aiNotes.submitInlineNote`
- `aiNotes.discardInlineNote`
- `aiNotes.revealNote`

The CodeLens action uses the Codicon `$(comment-discussion-sparkle)` with a translated tooltip. CodeLens icons are rendered by VS Code, so extensions cannot force icon color, icon size, custom SVGs, React icons, or CSS styling there. If future work needs a larger/yellow clickable element, it would require a different UI approach, likely an inline decoration or gutter decoration, with trade-offs.

The pending-note gutter marker uses a custom SVG at `media/note-pending.svg`. It is intentionally shown only on the first line of a multi-line note range to avoid repeated icons for the same note.

The inline comment input height and focus behavior are controlled by VS Code's Comments API. The extension can set `prompt`, `placeHolder`, commands, and keybindings, but cannot force the comment editor to exactly two lines. The current implementation uses the native `workbench.action.addComment` flow to stay as close as possible to VS Code's built-in UX.

`Ctrl+Enter` and `Cmd+Enter` are contributed as keybindings for `editor.action.submitComment` when the AI Notes comment editor is focused.

UI strings are English by default and Portuguese when `vscode.env.language` starts with `pt`. The generated Markdown field names remain in English to keep AI parsing stable.

## Resolution Workflow

Only notes with `Status: pending` are treated as active and rendered with gutter markers. Once an AI agent resolves a note, it should not delete the note. It should convert the note into a short historical record inside `# AI Notes`, for example:

```md
## NOTE-001 ✅

**Question:** "What does this section mean?"

**Answer:** The callback route is `/auth/done`, where the browser returns after authentication.
```

After conversion, the note no longer has `Status: pending`, so the extension stops showing a marker for it.

The extension automatically creates an `## Instructions for AI Agents` block inside `# AI Notes`. If a file already has `# AI Notes` but lacks those instructions, the next added note inserts the instructions before appending the new note.

## Notes

- The extension only works with `.md` files.
- The Markdown file is the source of truth.
- No database, JSON sidecar, hidden metadata, or binary storage is used.
- The generated Markdown structure stays in English for stable AI parsing, while UI labels use English by default and Portuguese when VS Code is running in `pt` or `pt-BR`.
- Note creation uses VS Code's native Comments API, so the editor stays close to the selected line.
- The inline comment editor height is controlled by VS Code and cannot be forced to exactly two lines by the extension API.
