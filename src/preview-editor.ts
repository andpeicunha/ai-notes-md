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
          await handleCreateNote(document, msg.selectedText, msg.humanComment);
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
  humanComment: string
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(originalDoc.uri);
  const fullText = document.getText();

  // Multi-strategy text matching (rendered HTML vs raw Markdown)
  let targetPos = findSelectedTextInDocument(fullText, selectedText);

  if (targetPos === -1) {
    vscode.window.showWarningMessage(
      'Could not find the selected text in the document. Try selecting a shorter or more unique passage.'
    );
    return;
  }

  const startPos = document.positionAt(targetPos);
  const endPos = document.positionAt(targetPos + selectedText.length);
  const startLine = startPos.line + 1;
  const endLine = getSelectionEndLine(new vscode.Selection(startPos, endPos));

  const action = vscode.workspace.getConfiguration('aiNotes').get<string>('resolvedNoteAction', 'delete') as 'delete' | 'convert-to-history';

  const note = buildNote({
    noteId: getNextNoteId(fullText),
    selectedText,
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

  // 4. Strip markdown formatting from raw text and re-search in fullText
  const plainRaw = stripMarkdown(fullText);
  pos = plainRaw.indexOf(selectedText);
  if (pos === -1) pos = plainRaw.indexOf(normalized);

  if (pos !== -1) {
    // Map plainRaw position back to fullText using surrounding context
    const ctxStart = Math.max(0, pos - 15);
    const ctxEnd = Math.min(plainRaw.length, pos + 15);
    const context = plainRaw.slice(ctxStart, ctxEnd);
    const fullCtx = fullText.indexOf(context);
    if (fullCtx !== -1) {
      return fullCtx + (pos - ctxStart);
    }
  }

  // 5. Table/cross-cell: split by tabs and try each cell individually
  const cells = selectedText.split(/\t| {2,}/).map(c => c.trim()).filter(c => c.length > 2);
  for (const cell of cells) {
    pos = fullText.indexOf(cell);
    if (pos !== -1) return pos;
  }

  return -1;
}

// Strip inline markdown formatting: `code`, **bold**, *italic*, [text](url)
function stripMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
