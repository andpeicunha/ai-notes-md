import * as vscode from 'vscode';
import { AI_NOTES_HEADING, AI_NOTES_INSTRUCTIONS_HEADING, NOTE_ID_PATTERN, ParsedAiNote, NoteInput, escapeRegExp, toBlockquote, formatLocalTimestamp, getNextNoteId, isMarkdownFile, parseAiNotes, getPendingNotes, buildAiNotesInstructions, buildNote, buildAppendText, getSelectionEndLine } from './notes-core';
import { MarkdownPreviewProvider } from './preview-editor';

function getResolvedNoteAction(): string {
  return vscode.workspace.getConfiguration('aiNotes').get<string>('resolvedNoteAction', 'delete');
}
const DEFAULT_MESSAGES = {
  openMarkdownFile: 'Open a Markdown file before adding an AI note.',
  onlyMarkdown: 'AI Notes can only be added to .md Markdown files.',
  selectMarkdownText: 'Select Markdown text before adding an AI note.',
  selectNonEmptyText: 'Select non-empty Markdown text before adding an AI note.',
  humanCommentTitle: 'Human Comment',
  humanCommentPrompt: 'Write an AI note',
  humanCommentRequired: 'Human Comment is required to add an AI note.',
  expectedAiActionTitle: 'Expected AI Action',
  saveInlineNote: 'Save AI Note',
  discardInlineNote: 'Discard AI Note',
  noteAdded: (noteId: string) => `AI note ${noteId} added.`,
  couldNotAddNote: 'Could not add AI note.',
  addAiNote: '$(comment-discussion-sparkle)',
  addAiNoteTooltip: 'Add AI Note',
  createdAt: 'Created At',
  openNote: 'Open note'
};

const PT_BR_MESSAGES: typeof DEFAULT_MESSAGES = {
  openMarkdownFile: 'Abra um arquivo Markdown antes de adicionar uma nota de IA.',
  onlyMarkdown: 'AI Notes só pode ser usado em arquivos Markdown .md.',
  selectMarkdownText: 'Selecione um trecho do Markdown antes de adicionar uma nota de IA.',
  selectNonEmptyText: 'Selecione um trecho não vazio do Markdown antes de adicionar uma nota de IA.',
  humanCommentTitle: 'Comentário humano',
  humanCommentPrompt: 'Escreva uma nota de IA',
  humanCommentRequired: 'O comentário humano é obrigatório para adicionar uma nota de IA.',
  expectedAiActionTitle: 'Ação esperada da IA',
  saveInlineNote: 'Salvar nota de IA',
  discardInlineNote: 'Descartar nota de IA',
  noteAdded: (noteId: string) => `Nota de IA ${noteId} adicionada.`,
  couldNotAddNote: 'Não foi possível adicionar a nota de IA.',
  addAiNote: '$(comment-discussion-sparkle)',
  addAiNoteTooltip: 'Adicionar nota de IA',
  createdAt: 'Criado em',
  openNote: 'Abrir nota'
};

export function activate(context: vscode.ExtensionContext) {
  const codeLensProvider = new AiNoteCodeLensProvider();
  const markerController = new AiNoteMarkerController(context);
  const commentController = vscode.comments.createCommentController('ai-notes-md', 'AI Notes');
  commentController.options = {
    prompt: getMessages().humanCommentPrompt,
    placeHolder: getMessages().humanCommentTitle
  };
  commentController.commentingRangeProvider = {
    provideCommentingRanges: (document) => {
      if (!isMarkdownFile(document)) {
        return [];
      }

      return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
    }
  };

  context.subscriptions.push(
    MarkdownPreviewProvider.register(context),
    vscode.commands.registerCommand('aiNotes.togglePreview', () => togglePreview()),
    commentController,
    vscode.commands.registerCommand('aiNotes.addNote', addAiNote),
    vscode.commands.registerCommand('aiNotes.addNoteFromContext', addAiNote),
    vscode.commands.registerCommand('aiNotes.addNoteFromCodeLens', addAiNote),
    vscode.commands.registerCommand('aiNotes.submitInlineNote', (reply: vscode.CommentReply) =>
      submitInlineNote(reply, markerController, codeLensProvider)
    ),
    vscode.commands.registerCommand('aiNotes.discardInlineNote', (thread: vscode.CommentThread) => thread.dispose()),
    vscode.commands.registerCommand('aiNotes.revealNote', revealNote),
    vscode.languages.registerCodeLensProvider({ language: 'markdown', scheme: 'file' }, codeLensProvider),
    vscode.window.onDidChangeTextEditorSelection(() => codeLensProvider.refresh()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      codeLensProvider.refresh();
      markerController.update(editor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === vscode.window.activeTextEditor?.document.uri.toString()) {
        codeLensProvider.refresh();
        markerController.update(vscode.window.activeTextEditor);
      }
    }),
    markerController
  );

  markerController.update(vscode.window.activeTextEditor);
}

async function togglePreview(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const uri = editor.document.uri;
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

  if (activeTab?.input instanceof vscode.TabInputCustom) {
    // Currently in custom editor, switch to default text editor
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
  } else {
    // Currently in text editor, switch to custom preview
    await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownPreviewProvider.viewType);
  }
}

export function deactivate() {
  // No resources to clean up.
}

function getMessages(): typeof DEFAULT_MESSAGES {
  return vscode.env.language.toLowerCase().startsWith('pt') ? PT_BR_MESSAGES : DEFAULT_MESSAGES;
}

async function addAiNote() {
  const editor = vscode.window.activeTextEditor;
  const messages = getMessages();

  if (!editor) {
    vscode.window.showWarningMessage(messages.openMarkdownFile);
    return;
  }

  const { document, selection } = editor;

  if (!isMarkdownFile(document)) {
    vscode.window.showWarningMessage(messages.onlyMarkdown);
    return;
  }

  if (selection.isEmpty) {
    const lineRange = document.lineAt(selection.active.line).range;
    editor.selection = new vscode.Selection(lineRange.start, lineRange.end);
  }

  const selectedText = document.getText(editor.selection).trim();

  if (!selectedText) {
    vscode.window.showWarningMessage(messages.selectNonEmptyText);
    return;
  }

  await vscode.commands.executeCommand('workbench.action.addComment');
}

async function submitInlineNote(
  reply: vscode.CommentReply,
  markerController: AiNoteMarkerController,
  codeLensProvider: AiNoteCodeLensProvider
) {
  const messages = getMessages();
  const thread = reply.thread;
  const document = await vscode.workspace.openTextDocument(thread.uri);
  const editor = vscode.window.activeTextEditor;
  const humanComment = reply.text.trim();

  if (!humanComment) {
    vscode.window.showWarningMessage(messages.humanCommentRequired);
    return;
  }

  if (!isMarkdownFile(document)) {
    vscode.window.showWarningMessage(messages.onlyMarkdown);
    thread.dispose();
    return;
  }

  const rawRange = thread.range;
  let threadRange: vscode.Range;

  if (!rawRange || (rawRange.start.line === rawRange.end.line && rawRange.start.character === rawRange.end.character)) {
    const fallbackLine = editor?.selection.active.line ?? 0;
    const safeLine = Math.max(0, Math.min(fallbackLine, document.lineCount - 1));
    const lineTextLength = document.lineAt(safeLine).text.length;
    threadRange = new vscode.Range(safeLine, 0, safeLine, lineTextLength);
  } else {
    threadRange = rawRange;
  }

  const selectedText = document.getText(threadRange).trim();

  if (!selectedText) {
    vscode.window.showWarningMessage(messages.selectNonEmptyText);
    thread.dispose();
    return;
  }

  const note = buildNote({
    noteId: getNextNoteId(document.getText()),
    selectedText,
    humanComment,
    expectedAiAction: '',
    startLine: threadRange.start.line + 1,
    endLine: getSelectionEndLine(new vscode.Selection(threadRange.start, threadRange.end)),
    createdAt: formatLocalTimestamp(new Date())
  });

  const edit = new vscode.WorkspaceEdit();
  const appendText = buildAppendText(document.getText(), note, getResolvedNoteAction() as 'delete' | 'convert-to-history');
  const endPosition = document.positionAt(document.getText().length);

  edit.insert(document.uri, endPosition, appendText);

  const didEdit = await vscode.workspace.applyEdit(edit);

  if (didEdit) {
    thread.dispose();
    markerController.update(editor?.document.uri.toString() === document.uri.toString() ? editor : undefined);
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(messages.noteAdded(note.noteId));
  } else {
    vscode.window.showErrorMessage(messages.couldNotAddNote);
  }
}

async function revealNote(documentUri: string, noteLine: number) {
  const uri = vscode.Uri.parse(documentUri);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  const safeLine = Math.max(0, Math.min(noteLine, document.lineCount - 1));
  const line = document.lineAt(safeLine);
  const range = new vscode.Range(safeLine, 0, safeLine, line.text.length);

  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function buildNoteHover(note: ParsedAiNote): vscode.MarkdownString {
  const messages = getMessages();
  const openNoteArgs = encodeURIComponent(JSON.stringify([note.documentUri, note.noteLine]));
  const hover = new vscode.MarkdownString(undefined, true);
  hover.isTrusted = true;
  hover.appendMarkdown(`**${note.noteId}** (${note.status})\n\n`);
  hover.appendMarkdown(`**${messages.humanCommentTitle}**\n\n${note.humanComment}\n\n`);
  hover.appendMarkdown(`**${messages.expectedAiActionTitle}**\n\n${note.expectedAiAction}\n\n`);
  hover.appendMarkdown(`**${messages.createdAt}:** ${note.createdAt}\n\n`);
  hover.appendMarkdown(`[${messages.openNote}](command:aiNotes.revealNote?${openNoteArgs})`);
  return hover;
}

class AiNoteCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const editor = vscode.window.activeTextEditor;
    const codeLenses: vscode.CodeLens[] = [];

    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      return [];
    }

    if (!isMarkdownFile(document)) {
      return [];
    }

    if (!editor.selection.isEmpty && document.getText(editor.selection).trim()) {
      const messages = getMessages();
      const range = new vscode.Range(editor.selection.start.line, 0, editor.selection.start.line, 0);

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: messages.addAiNote,
          tooltip: messages.addAiNoteTooltip,
          command: 'aiNotes.addNoteFromCodeLens'
        })
      );
    }

    return codeLenses;
  }
}

class AiNoteMarkerController implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private visibleEditor?: vscode.TextEditor;

  constructor(context: vscode.ExtensionContext) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'media', 'note-pending.svg'),
      gutterIconSize: 'contain',
      overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  update(editor: vscode.TextEditor | undefined): void {
    if (this.visibleEditor && this.visibleEditor !== editor) {
      this.visibleEditor.setDecorations(this.decorationType, []);
    }

    this.visibleEditor = editor;

    if (!editor || !isMarkdownFile(editor.document)) {
      return;
    }

    const decorations = getPendingNotes(editor.document).map((note) => {
      const startLine = Math.max(0, Math.min(note.startLine - 1, editor.document.lineCount - 1));
      const range = new vscode.Range(startLine, 0, startLine, editor.document.lineAt(startLine).text.length);

      return {
        range,
        hoverMessage: buildNoteHover(note)
      };
    });

    editor.setDecorations(this.decorationType, decorations);
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}

