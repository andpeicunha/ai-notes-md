import * as vscode from 'vscode';

const AI_NOTES_HEADING = '# AI Notes';
const AI_NOTES_INSTRUCTIONS_HEADING = '## Instructions for AI Agents';
const AI_NOTES_INSTRUCTIONS = [
  AI_NOTES_INSTRUCTIONS_HEADING,
  '',
  'When analyzing this document, treat every note with `Status: pending` as an active request.',
  '',
  'After resolving a note:',
  '',
  '1. Delete the note block entirely from the document — do not keep it as a historical record.',
  '2. If no `Status: pending` notes remain after deletion, also remove the entire `# AI Notes` section,',
  '   including the `---` separator above it and this `## Instructions for AI Agents` block.',
  '',
  'Unresolved notes must remain unchanged with `Status: pending`.'
].join('\n');
const NOTE_ID_PATTERN = /## NOTE-(\d{3,})\b/g;
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
    commentController,
    vscode.commands.registerCommand('aiNotes.addNote', () => addAiNote(commentController)),
    vscode.commands.registerCommand('aiNotes.addNoteFromContext', () => addAiNote(commentController)),
    vscode.commands.registerCommand('aiNotes.addNoteFromCodeLens', () => addAiNote(commentController)),
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

export function deactivate() {
  // No resources to clean up.
}

function getMessages(): typeof DEFAULT_MESSAGES {
  return vscode.env.language.toLowerCase().startsWith('pt') ? PT_BR_MESSAGES : DEFAULT_MESSAGES;
}

async function addAiNote(commentController: vscode.CommentController) {
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
    vscode.window.showWarningMessage(messages.selectMarkdownText);
    return;
  }

  const selectedText = document.getText(selection).trim();

  if (!selectedText) {
    vscode.window.showWarningMessage(messages.selectNonEmptyText);
    return;
  }

  const thread = commentController.createCommentThread(document.uri, selection, []);
  thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
  setTimeout(() => { vscode.commands.executeCommand('workbench.action.focusNextPart'); }, 150);
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

  const threadRange = thread.range;

  if (!threadRange) {
    vscode.window.showWarningMessage(messages.selectMarkdownText);
    thread.dispose();
    return;
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
  const appendText = buildAppendText(document.getText(), note);
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

function getNextNoteId(documentText: string): string {
  let highest = 0;
  let match: RegExpExecArray | null;

  while ((match = NOTE_ID_PATTERN.exec(documentText)) !== null) {
    const parsed = Number.parseInt(match[1], 10);
    if (parsed > highest) {
      highest = parsed;
    }
  }

  return `NOTE-${String(highest + 1).padStart(3, '0')}`;
}

function isMarkdownFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'markdown' && document.fileName.toLowerCase().endsWith('.md');
}

type ParsedAiNote = {
  noteId: string;
  status: string;
  startLine: number;
  endLine: number;
  humanComment: string;
  expectedAiAction: string;
  createdAt: string;
  noteLine: number;
  documentUri: string;
};

function parseAiNotes(document: vscode.TextDocument): ParsedAiNote[] {
  const text = document.getText();
  const sectionIndex = text.search(new RegExp(`^${escapeRegExp(AI_NOTES_HEADING)}\\s*$`, 'm'));

  if (sectionIndex === -1) {
    return [];
  }

  const notesText = text.slice(sectionIndex);
  const notePattern = /^## (NOTE-\d{3,})\s*$/gm;
  const noteMatches = Array.from(notesText.matchAll(notePattern));
  const notes: ParsedAiNote[] = [];

  for (const [index, match] of noteMatches.entries()) {
    if (match.index === undefined) {
      continue;
    }

    const noteOffset = sectionIndex + match.index;
    const noteEnd = noteMatches[index + 1]?.index ?? notesText.length;
    const noteBlock = notesText.slice(match.index, noteEnd);
    const status = extractSingleLineField(noteBlock, 'Status') ?? 'unknown';
    const lines = extractSingleLineField(noteBlock, 'Lines');
    const lineMatch = lines?.match(/^(\d+)-(\d+)$/);

    if (!lineMatch) {
      continue;
    }

    notes.push({
      noteId: match[1],
      status,
      startLine: Number.parseInt(lineMatch[1], 10),
      endLine: Number.parseInt(lineMatch[2], 10),
      humanComment: extractMultilineField(noteBlock, 'Human Comment', ['Expected AI Action', 'Created At']),
      expectedAiAction: extractMultilineField(noteBlock, 'Expected AI Action', ['Created At']),
      createdAt: extractSingleLineField(noteBlock, 'Created At') ?? '',
      noteLine: document.positionAt(noteOffset).line,
      documentUri: document.uri.toString()
    });
  }

  return notes;
}

function extractSingleLineField(noteBlock: string, fieldName: string): string | undefined {
  const match = noteBlock.match(new RegExp(`^${escapeRegExp(fieldName)}:\\s*(.*)$`, 'm'));
  const sameLineValue = match?.[1]?.trim();

  if (sameLineValue) {
    return sameLineValue;
  }

  const multilineValue = extractMultilineField(noteBlock, fieldName, [
    'Status',
    'Lines',
    'Selected Text',
    'Human Comment',
    'Expected AI Action',
    'Created At'
  ]);

  return multilineValue.split(/\r?\n/).find((line) => line.trim())?.trim();
}

function extractMultilineField(noteBlock: string, fieldName: string, nextFieldNames: string[]): string {
  const fieldMatch = noteBlock.match(new RegExp(`^${escapeRegExp(fieldName)}:\\s*$`, 'm'));

  if (!fieldMatch || fieldMatch.index === undefined) {
    return '';
  }

  const valueStart = fieldMatch.index + fieldMatch[0].length;
  const rest = noteBlock.slice(valueStart);
  const nextPattern = new RegExp(`\\n+\\s*(?:${nextFieldNames.map(escapeRegExp).join('|')}):\\s*(?:\\n|$)`, 'm');
  const nextMatch = rest.match(nextPattern);
  const rawValue = nextMatch && nextMatch.index !== undefined ? rest.slice(0, nextMatch.index) : rest;

  return rawValue.trim();
}

function getPendingNotes(document: vscode.TextDocument): ParsedAiNote[] {
  return parseAiNotes(document).filter((note) => note.status.toLowerCase() === 'pending');
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

    // Navigation CodeLens for lines with pending notes
    for (const note of getPendingNotes(document)) {
      const noteLine = Math.max(0, note.startLine - 1);
      const noteRange = new vscode.Range(noteLine, 0, noteLine, 0);
      codeLenses.push(
        new vscode.CodeLens(noteRange, {
          title: `$(bookmark) ${note.noteId}`,
          tooltip: getMessages().openNote,
          command: 'aiNotes.revealNote',
          arguments: [note.documentUri, note.noteLine]
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
      const range = new vscode.Range(startLine, 0, startLine, 0);

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

function getSelectionEndLine(selection: vscode.Selection): number {
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    return selection.end.line;
  }

  return selection.end.line + 1;
}

type NoteInput = {
  noteId: string;
  selectedText: string;
  humanComment: string;
  expectedAiAction: string;
  startLine: number;
  endLine: number;
  createdAt: string;
};

function buildNote(input: NoteInput): { noteId: string; markdown: string } {
  const selectedBlock = toBlockquote(input.selectedText);
  const expectedAction = input.expectedAiAction || 'Not specified.';

  return {
    noteId: input.noteId,
    markdown: [
      `## ${input.noteId}`,
      '',
      'Status: pending',
      '',
      `Lines: ${input.startLine}-${input.endLine}`,
      '',
      'Selected Text:',
      '',
      selectedBlock,
      '',
      'Human Comment:',
      '',
      input.humanComment,
      '',
      'Expected AI Action:',
      '',
      expectedAction,
      '',
      'Created At:',
      '',
      input.createdAt
    ].join('\n')
  };
}

function toBlockquote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function buildAppendText(documentText: string, note: { markdown: string }): string {
  const endsWithNewline = /\r?\n$/.test(documentText);
  const hasAiNotesSection = new RegExp(`^${escapeRegExp(AI_NOTES_HEADING)}\\s*$`, 'm').test(documentText);
  const hasInstructions = new RegExp(`^${escapeRegExp(AI_NOTES_INSTRUCTIONS_HEADING)}\\s*$`, 'm').test(documentText);
  const prefix = endsWithNewline ? '' : '\n';

  if (hasAiNotesSection) {
    if (!hasInstructions) {
      return `${prefix}\n${AI_NOTES_INSTRUCTIONS}\n\n${note.markdown}\n`;
    }

    return `${prefix}\n${note.markdown}\n`;
  }

  return `${prefix}\n---\n\n${AI_NOTES_HEADING}\n\n${AI_NOTES_INSTRUCTIONS}\n\n${note.markdown}\n`;
}

function formatLocalTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
