import * as vscode from 'vscode';
import {
  parseAiNotes,
  isMarkdownFile,
  getNextNoteId,
  buildNote,
  buildAppendText,
  formatLocalTimestamp,
  getSelectionEndLine
} from './notes-core';

export class MarkdownPreviewProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'aiNotes.markdownPreview';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MarkdownPreviewProvider.viewType,
      new MarkdownPreviewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'renderer.bundle.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css')
    );
    const nonce = getNonce();

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="annotations"></div>
  <div id="content" class="markdown-body"></div>
  <div id="preview-zoom-control" class="preview-zoom-control" aria-label="Preview zoom controls">
    <span class="preview-zoom-label">Zoom</span>
    <button id="preview-zoom-out" class="preview-zoom-button" type="button" title="Decrease preview text size" aria-label="Decrease preview text size">−</button>
    <button id="preview-zoom-reset" class="preview-zoom-button preview-zoom-reset" type="button" title="Reset preview text size" aria-label="Reset preview text size">100%</button>
    <button id="preview-zoom-in" class="preview-zoom-button" type="button" title="Increase preview text size" aria-label="Increase preview text size">+</button>
  </div>
  <div id="note-panel">
    <div class="note-panel-header">
      <span class="note-panel-title">Add note for:</span>
      <button id="note-panel-cancel" class="note-panel-btn-cancel">&times;</button>
    </div>
    <div id="note-panel-selected" class="note-panel-selected"></div>
    <textarea id="note-panel-input" placeholder="Write your comment..." rows="3"></textarea>
    <div class="note-panel-actions">
      <button id="note-panel-submit" class="note-panel-btn-submit">Save</button>
    </div>
  </div>
  <div id="note-tooltip">
    <button id="note-tooltip-close" class="note-tooltip-close">&times;</button>
    <div id="tooltip-note-id" class="note-tooltip-id"></div>
    <div id="tooltip-note-text" class="note-tooltip-text"></div>
    <button class="note-tooltip-edit">Edit in editor</button>
  </div>
  <script nonce="${nonce}">
    (() => {
      const min = 80;
      const max = 180;
      const step = 10;
      const defaultZoom = 100;
      const storageKey = 'aiNotes.previewZoom';
      let zoom = defaultZoom;

      const readSavedZoom = () => {
        try {
          const saved = Number(localStorage.getItem(storageKey));
          return Number.isFinite(saved) ? saved : defaultZoom;
        } catch {
          return defaultZoom;
        }
      };

      const saveZoom = () => {
        try { localStorage.setItem(storageKey, String(zoom)); } catch {}
      };

      const setZoom = (value) => {
        zoom = Math.min(max, Math.max(min, value));
        document.documentElement.style.setProperty('--preview-font-size', zoom + '%');

        const reset = document.getElementById('preview-zoom-reset');
        const out = document.getElementById('preview-zoom-out');
        const input = document.getElementById('preview-zoom-in');
        if (reset) reset.textContent = zoom + '%';
        if (out) out.disabled = zoom <= min;
        if (input) input.disabled = zoom >= max;
        saveZoom();
      };

      setZoom(readSavedZoom());
      document.getElementById('preview-zoom-out')?.addEventListener('click', () => setZoom(zoom - step));
      document.getElementById('preview-zoom-in')?.addEventListener('click', () => setZoom(zoom + step));
      document.getElementById('preview-zoom-reset')?.addEventListener('click', () => setZoom(defaultZoom));
    })();
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;

    // Sync: document changes → webview
    const sendUpdate = () => {
      webview.postMessage({ type: 'update', text: document.getText() });
    };

    const docSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        sendUpdate();
      }
    });

    // Messages from webview → host
    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'revealNote':
          await revealNoteInEditor(document.uri, msg.noteId);
          break;
        case 'createNote':
          await handleCreateNote(document, msg.selectedText, msg.humanComment, msg.lineHint);
          break;
      }
    });

    webviewPanel.onDidDispose(() => docSub.dispose());
    sendUpdate();
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

async function revealNoteInEditor(documentUri: vscode.Uri, noteId: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();
  const noteRegex = new RegExp(`^## ${escapeRegex(noteId)}\\s*$`, 'm');
  const match = noteRegex.exec(text);

  if (!match) {
    vscode.window.showWarningMessage(`Note ${noteId} not found in document.`);
    return;
  }

  const noteLine = document.positionAt(match.index).line;
  const editor = await vscode.window.showTextDocument(document);
  const range = new vscode.Range(noteLine, 0, noteLine, document.lineAt(noteLine).text.length);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function handleCreateNote(
  originalDoc: vscode.TextDocument,
  selectedText: string,
  humanComment: string,
  lineHint?: number
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(originalDoc.uri);
  const fullText = document.getText();

  const targetRange = findSelectedTextRangeInText(fullText, selectedText, lineHint);

  if (!targetRange) {
    vscode.window.showWarningMessage(
      'Could not find the selected text in the document. Try selecting a shorter or more unique passage.'
    );
    return;
  }

  const startPos = document.positionAt(targetRange.start);
  const endPos = document.positionAt(targetRange.end);
  const startLine = startPos.line + 1;
  const endLine = getSelectionEndLine(new vscode.Selection(startPos, endPos));

  const action = vscode.workspace.getConfiguration('aiNotes').get<string>('resolvedNoteAction', 'delete') as 'delete' | 'convert-to-history';

  const note = buildNote({
    noteId: getNextNoteId(fullText),
    selectedText: targetRange.text,
    humanComment,
    expectedAiAction: '',
    startLine,
    endLine,
    createdAt: formatLocalTimestamp(new Date())
  });

  const appendText = buildAppendText(fullText, note, action);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, document.positionAt(fullText.length), appendText);

  const didEdit = await vscode.workspace.applyEdit(edit);
  if (didEdit) {
    vscode.window.showInformationMessage(`${note.noteId} added.`);
  } else {
    vscode.window.showErrorMessage('Could not add note.');
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type TextRangeMatch = {
  start: number;
  end: number;
  text: string;
};

export function findSelectedTextRangeInText(fullText: string, selectedText: string, preferredLine?: number): TextRangeMatch | undefined {
  const exact = fullText.indexOf(selectedText);
  if (exact !== -1 && preferredLine === undefined) {
    return { start: exact, end: exact + selectedText.length, text: selectedText };
  }

  const selectedPlain = normalizePlainText(selectedText);
  if (!selectedPlain) {
    return undefined;
  }

  const candidates: Array<TextRangeMatch & { line: number }> = [];
  let offset = 0;
  let lineNumber = 1;

  for (const line of fullText.split(/(\r?\n)/)) {
    if (/^\r?\n$/.test(line)) {
      offset += line.length;
      lineNumber += 1;
      continue;
    }

    if (normalizePlainText(line).includes(selectedPlain)) {
      candidates.push({ start: offset, end: offset + line.length, text: line, line: lineNumber });
    }

    offset += line.length;
  }

  if (candidates.length > 0) {
    if (preferredLine !== undefined) {
      candidates.sort((a, b) => Math.abs(a.line - preferredLine) - Math.abs(b.line - preferredLine));
    }
    const best = candidates[0];
    return { start: best.start, end: best.end, text: best.text };
  }

  if (exact !== -1) {
    return { start: exact, end: exact + selectedText.length, text: selectedText };
  }

  const fuzzy = findSelectedTextInDocument(fullText, selectedText);
  if (fuzzy !== -1) {
    return { start: fuzzy, end: fuzzy + selectedText.length, text: selectedText };
  }

  return undefined;
}


// Robust text matching: handles markdown formatting differences between
// rendered HTML (what user selects) and raw markdown source.
function findSelectedTextInDocument(fullText: string, selectedText: string): number {
  // 1. Exact match
  let pos = fullText.indexOf(selectedText);
  if (pos !== -1) return pos;

  // 2. Normalized whitespace
  const normalized = selectedText.replace(/\s+/g, ' ').trim();
  pos = fullText.indexOf(normalized);
  if (pos !== -1) return pos;

  // 3. Try each non-empty line of the selection
  const lines = selectedText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 2);
  for (const line of lines) {
    pos = fullText.indexOf(line);
    if (pos !== -1) return pos;
  }

  // 4. Strip markdown from raw, confirm text exists, then find via word anchors
  const plainRaw = stripMarkdown(fullText);
  const inPlain = plainRaw.indexOf(selectedText) !== -1 ||
                   plainRaw.indexOf(normalized) !== -1;

  if (inPlain) {
    // Text confirmed to exist. Find position via word anchors in fullText.
    pos = findViaWords(fullText, selectedText);
    if (pos !== -1) return pos;
  }

  // 5. Table/cross-cell: split by tabs/spaces and try each cell
  const cells = selectedText.split(/\t| {2,}/).map(c => c.trim()).filter(c => c.length > 2);
  for (const cell of cells) {
    pos = fullText.indexOf(cell);
    if (pos !== -1) return pos;
  }

  // 6. Last resort: find any unique word ≥ 4 chars from the selection
  pos = findViaWords(fullText, selectedText);
  return pos;
}

// Find position by searching for the longest unique word sequence from selectedText
function findViaWords(fullText: string, selectedText: string): number {
  const words = selectedText.split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return -1;

  // Try increasingly shorter prefixes: 5 words → 4 → 3 → 2 → 1
  for (let len = Math.min(5, words.length); len >= 1; len--) {
    const chunk = words.slice(0, len).join(' ');
    let pos = fullText.indexOf(chunk);
    if (pos !== -1) {
      // Check if unique
      const second = fullText.indexOf(chunk, pos + 1);
      if (second === -1) return pos; // unique match
      if (len === 1) return pos;     // last resort: single word, use first
    }
  }

  return -1;
}

// Strip inline markdown formatting: `code`, **bold**, *italic*, [text](url)
function stripMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '');
}

function normalizePlainText(text: string): string {
  return stripMarkdown(text).replace(/\s+/g, ' ').trim();
}
