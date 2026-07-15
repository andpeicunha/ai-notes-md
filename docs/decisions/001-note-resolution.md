# Decision: Resolved AI Notes

**Status:** Accepted
**Date:** 2026-07-15

## Context

Pending notes are kept in `# AI Notes` and rendered by the extension as gutter markers. Once an AI agent resolves a note, users need to choose whether to remove it or retain it as a decision record.

## Decision

Add the `aiNotes.resolvedNoteAction` setting with these values:

- `delete` (**default**) — instructs AI agents to remove the entire resolved `## NOTE-XXX` block.
- `convert-to-history` — instructs AI agents to move the resolved note to `# AI Notes History` as `## NOTE-XXX ✅`.

`# AI Notes` must contain only active, operational notes. `# AI Notes History` is reserved for resolved decision records.

The selected behavior applies to instructions generated after the user changes the setting. Existing instruction blocks are not updated automatically.

## Consequences

- New users get a clean Markdown document after notes are resolved.
- Users who need an audit trail can opt in to a separate, readable history section.
- The extension continues to show gutter markers only for pending notes.
- The setting description and changelog must explain both options and the non-retroactive behavior.

## Related Visual Decision

The extension icon will retain its current visual identity but be re-exported with the artwork enlarged to approximately `104 × 104 px` within its `128 × 128 px` canvas, removing excess transparent padding in VS Code's extension list.
