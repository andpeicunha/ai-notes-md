import * as vscode from 'vscode';

export const AI_NOTES_HEADING = '# AI Notes';
export const AI_NOTES_INSTRUCTIONS_HEADING = '## Instructions for AI Agents';
export const NOTE_ID_PATTERN = /## NOTE-(\d{3,})\b/g;

export type ParsedAiNote = {
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

export type NoteInput = {
  noteId: string;
  selectedText: string;
  humanComment: string;
  expectedAiAction: string;
  startLine: number;
  endLine: number;
  createdAt: string;
};

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toBlockquote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function formatLocalTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function getNextNoteId(documentText: string): string {
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

export function isMarkdownFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'markdown' && document.fileName.toLowerCase().endsWith('.md');
}

export function parseAiNotes(document: vscode.TextDocument): ParsedAiNote[] {
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

export function getPendingNotes(document: vscode.TextDocument): ParsedAiNote[] {
  return parseAiNotes(document).filter((note) => note.status.toLowerCase() === 'pending');
}

export function buildAiNotesInstructions(action: 'delete' | 'convert-to-history'): string {
  const lines: string[] = [
    AI_NOTES_INSTRUCTIONS_HEADING,
    '',
    'When analyzing this document, treat every note with `Status: pending` as an active request.',
    '',
    'After resolving a note:',
    ''
  ];

  if (action === 'delete') {
    lines.push('1. Delete the entire `## NOTE-XXX` block from the document.');
  } else {
    lines.push(
      '1. Do not delete the note.',
      '2. Move the `## NOTE-XXX` block to a separate `# AI Notes History` section at the end of the document.',
      '3. Change the heading to `## NOTE-XXX ✅`.',
      '4. Remove the fields `Status`, `Lines`, `Selected Text`, `Human Comment`, `Expected AI Action`, and `Created At`.',
      '5. Summarize the outcome using readable labels such as `**Question:**`, `**Decision:**`, `**Answer:**`, or `**Visual reference:**`.'
    );
  }

  lines.push('', 'Unresolved notes must remain unchanged with `Status: pending`.');

  return lines.join('\n');
}

export function buildNote(input: NoteInput): { noteId: string; markdown: string } {
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

export function buildAppendText(
  documentText: string,
  note: { markdown: string },
  instructionsAction: 'delete' | 'convert-to-history'
): string {
  const endsWithNewline = /\r?\n$/.test(documentText);
  const hasAiNotesSection = new RegExp(`^${escapeRegExp(AI_NOTES_HEADING)}\\s*$`, 'm').test(documentText);
  const hasInstructions = new RegExp(`^${escapeRegExp(AI_NOTES_INSTRUCTIONS_HEADING)}\\s*$`, 'm').test(documentText);
  const prefix = endsWithNewline ? '' : '\n';

  if (hasAiNotesSection) {
    if (!hasInstructions) {
      return `${prefix}\n${buildAiNotesInstructions(instructionsAction)}\n\n${note.markdown}\n`;
    }

    return `${prefix}\n${note.markdown}\n`;
  }

  return `${prefix}\n---\n\n${AI_NOTES_HEADING}\n\n${buildAiNotesInstructions(instructionsAction)}\n\n${note.markdown}\n`;
}

export function getSelectionEndLine(selection: vscode.Selection): number {
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    return selection.end.line;
  }

  return selection.end.line + 1;
}
