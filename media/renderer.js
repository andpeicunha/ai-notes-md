import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

// ── Setup marked ──
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);
marked.setOptions({ gfm: true, breaks: false });

const vscode = acquireVsCodeApi();
let currentRawText = '';

// ── Parse notes from raw markdown ──
function parseNotes(text) {
  const notes = [];
  const sectionMatch = text.match(/^# AI Notes\s*$/m);
  if (!sectionMatch || sectionMatch.index === undefined) return notes;

  const notesText = text.slice(sectionMatch.index);
  const notePattern = /^## (NOTE-\d{3,})\s*$/gm;
  const noteMatches = [...notesText.matchAll(notePattern)];

  for (const [index, match] of noteMatches.entries()) {
    if (match.index === undefined) continue;

    const noteEnd = noteMatches[index + 1]?.index ?? notesText.length;
    const block = notesText.slice(match.index, noteEnd);

    const status = extractField(block, 'Status');
    if (!status || status.toLowerCase() !== 'pending') continue;

    const lines = extractField(block, 'Lines');
    const lineMatch = lines?.match(/^(\d+)-(\d+)$/);
    if (!lineMatch) continue;

    notes.push({
      noteId: match[1],
      startLine: parseInt(lineMatch[1], 10),
      endLine: parseInt(lineMatch[2], 10),
      humanComment: extractMultiline(block, 'Human Comment', ['Expected AI Action', 'Created At']),
      createdAt: extractField(block, 'Created At') ?? ''
    });
  }

  return notes;
}

function extractField(block, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function extractMultiline(block, fieldName, nextFields) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldMatch = block.match(new RegExp(`^${escaped}:\\s*$`, 'm'));
  if (!fieldMatch || fieldMatch.index === undefined) return '';

  const start = fieldMatch.index + fieldMatch[0].length;
  const rest = block.slice(start);
  const nextPattern = new RegExp(`\\n+\\s*(?:${nextFields.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s*(?:\\n|$)`, 'm');
  const nextMatch = rest.match(nextPattern);
  const end = nextMatch?.index ?? rest.length;
  return rest.slice(0, end).trim();
}

// ── Helpers ──
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Inject annotation markers into raw text before rendering ──
function injectAnnotationMarkers(rawText, notes) {
  if (!notes.length) return rawText;

  // Find where the AI Notes section starts to exclude it from line counting
  const sectionIdx = rawText.indexOf('\n# AI Notes');
  const mainText = sectionIdx === -1 ? rawText : rawText.slice(0, sectionIdx);
  const mainLines = mainText.split('\n');

  // Build { lineNumber → [noteIds] } map
  const lineMap = new Map();
  for (const note of notes) {
    for (let i = note.startLine; i <= note.endLine; i++) {
      if (i < 1 || i > mainLines.length) continue;
      if (!lineMap.has(i)) lineMap.set(i, []);
      lineMap.get(i).push(note.noteId);
    }
  }

  if (lineMap.size === 0) return rawText;

  const result = [];
  let openNoteId = null;
  let blankRun = false;

  for (let i = 0; i < mainLines.length; i++) {
    const lineNum = i + 1;
    const noteIds = lineMap.get(lineNum);
    const isBlank = mainLines[i].trim() === '';
    const prefix = getBlockPrefix(mainLines[i]);

    if (noteIds && noteIds.length > 0) {
      const noteId = noteIds[0];

      // Check if we're in a new continuous block (blank line resets)
      if (blankRun && openNoteId !== null) {
        result.push('</span>');
        openNoteId = null;
      }

      if (openNoteId !== noteId) {
        if (openNoteId !== null) result.push('</span>');

        if (!isBlank && !isTableRow(mainLines[i])) {
          const content = mainLines[i].slice(prefix.length);
          result.push(prefix + `<span class="ai-note-line" data-note-id="${noteId}">${content}`);
          openNoteId = noteId;
          continue;
        }
        // Table row or blank: close span, let raw line pass through un-wrapped
        openNoteId = null;
      }
    } else {
      if (openNoteId !== null) {
        result.push('</span>');
        openNoteId = null;
      }
    }

    result.push(mainLines[i]);

    // Track blank runs
    if (isBlank) {
      blankRun = true;
    } else {
      // Reset blank run if the next line is in the same annotation
      if (lineMap.has(lineNum + 1) && openNoteId !== null) {
        blankRun = false;
      }
    }
  }

  if (openNoteId !== null) result.push('</span>');

  // Reattach the AI Notes section if it was there
  const markedText = result.join('\n');
  if (sectionIdx !== -1) {
    return markedText + rawText.slice(sectionIdx);
  }
  return markedText;
}

// ── Annotation toggle bar at top (collapsible) ──
function renderAnnotationCards(notes) {
  const container = document.getElementById('annotations');
  if (!notes.length) {
    container.innerHTML = '';
    return;
  }

  const count = notes.length;
  const label = count === 1 ? '1 note' : `${count} notes`;

  container.innerHTML = `
    <div id="notes-toggle" class="notes-toggle-bar">
      <span class="notes-toggle-icon">▸</span>
      <span class="notes-toggle-count">${label}</span>
    </div>
    <div id="notes-list" class="notes-list collapsed">
      ${notes.map(note => `
        <div class="note-chip" data-note-id="${escapeHtml(note.noteId)}" data-start-line="${note.startLine}">
          <span class="note-chip-id">${escapeHtml(note.noteId)}</span>
          <span class="note-chip-text">${escapeHtml(truncate(note.humanComment, 80))}</span>
          <span class="note-chip-lines">L${note.startLine}-${note.endLine}${tableTag(note)}</span>
        </div>
      `).join('')}
    </div>
  `;

  // Toggle expand/collapse
  document.getElementById('notes-toggle').addEventListener('click', () => {
    const list = document.getElementById('notes-list');
    const icon = document.querySelector('.notes-toggle-icon');
    const isCollapsed = list.classList.contains('collapsed');
    list.classList.toggle('collapsed');
    icon.textContent = isCollapsed ? '▾' : '▸';
  });

  // Click chip → reveal in editor
  container.querySelectorAll('.note-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const noteId = chip.dataset.noteId;
      const highlight = document.querySelector(`.ai-note-line[data-note-id="${noteId}"]`);
      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // No inline highlight (e.g., table): scroll to approximate line position
        const startLine = parseInt(chip.dataset.startLine, 10) || 1;
        const lineHeight = 24; // approximate px per raw line
        const content = document.getElementById('content');
        const scrollParent = document.scrollingElement || document.documentElement;
        const contentTop = content.getBoundingClientRect().top + window.scrollY;
        scrollParent.scrollTo({ top: contentTop + (startLine - 1) * lineHeight, behavior: 'smooth' });
      }
    });
  });
}

function truncate(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen).trim() + '…' : text;
}

function tableTag(note) {
  // Check if the annotated line is a table row
  const lines = currentRawText.split('\n');
  const line = lines[note.startLine - 1] || '';
  if (isTableRow(line)) return ' · table';
  return '';
}


// Detect block-level Markdown prefix that must stay outside the highlight span
function getBlockPrefix(line) {
  // List items: "- ", "* ", "+ ", "1. ", etc. (with optional indent)
  const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
  if (listMatch) return listMatch[1];

  // Blockquote: ">" with optional space
  const quoteMatch = line.match(/^(\s*>\s?)/);
  if (quoteMatch) return quoteMatch[1];

  // Headings: "#", "##", etc.
  const headingMatch = line.match(/^(#{1,6}\s+)/);
  if (headingMatch) return headingMatch[1];

  return '';
}

// Table rows have pipes and are not separator lines
function isTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (/^[\|\s\-:]+$/.test(trimmed)) return false;
  return trimmed.startsWith('|') || trimmed.endsWith('|');
}

// ── Inline comment input panel ──
function showNotePanel(selectedText) {
  const panel = document.getElementById('note-panel');
  document.getElementById('note-panel-selected').textContent = selectedText;
  document.getElementById('note-panel-input').value = '';
  panel.classList.add('open');
  document.getElementById('note-panel-input').focus();
}

function hideNotePanel() {
  document.getElementById('note-panel').classList.remove('open');
  document.getElementById('note-panel-input').value = '';
}

function submitNote() {
  const input = document.getElementById('note-panel-input');
  const comment = input.value.trim();
  if (!comment) return;

  const selectedText = String(document.getElementById('note-panel-selected').textContent ?? '');
  vscode.postMessage({ type: 'createNote', selectedText, humanComment: comment });
  hideNotePanel();
}

// ── Selection → show comment panel ──
let selectionTimer = null;

// Wire up panel buttons (DOM is static, elements always present)
document.getElementById('note-panel-cancel').addEventListener('click', hideNotePanel);
document.getElementById('note-panel-submit').addEventListener('click', submitNote);

// Ctrl+Enter / Cmd+Enter to save
document.getElementById('note-panel-input').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    submitNote();
  }
  // Escape to cancel
  if (e.key === 'Escape') {
    e.preventDefault();
    hideNotePanel();
  }
});

function isInsideAnnotations(el) {
  return el && (el.closest('#annotations') || el.closest('.note-card') || el.closest('#note-panel'));
}

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const selectedText = selection.toString().trim();
  if (!selectedText || selectedText.length < 3) return;

  const anchor = selection.anchorNode;
  if (anchor && isInsideAnnotations(anchor instanceof HTMLElement ? anchor : anchor.parentElement)) return;

  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const current = window.getSelection()?.toString().trim() ?? '';
    if (current.length >= 3) {
      showNotePanel(current);
    }
  }, 300);
});

// ── Render ──
function renderAll(rawText) {
  currentRawText = rawText;
  const notes = parseNotes(rawText);

  // Inject annotation markers before rendering
  const markedText = injectAnnotationMarkers(rawText, notes);
  const html = DOMPurify.sanitize(marked.parse(markedText), { ALLOW_DATA_ATTR: true });

  document.getElementById('content').innerHTML = html;
  renderAnnotationCards(notes);

  // Wire up click on highlighted spans → show custom tooltip
  const noteById = new Map(notes.map(n => [n.noteId, n]));
  document.querySelectorAll('.ai-note-line').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const note = noteById.get(el.dataset.noteId);
      if (note) {
        showNoteTooltip(el, note);
      }
    });
  });
}

// ── Custom tooltip for highlighted notes ──
let tooltipTimer = null;

function showNoteTooltip(anchor, note) {
  hideNoteTooltip();
  clearTimeout(tooltipTimer);

  const tooltip = document.getElementById('note-tooltip');
  document.getElementById('tooltip-note-id').textContent = note.noteId;
  document.getElementById('tooltip-note-text').textContent = note.humanComment;
  tooltip.querySelector('.note-tooltip-edit').dataset.noteId = note.noteId;

  const rect = anchor.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 4}px`;
  tooltip.style.left = `${Math.max(4, rect.left + window.scrollX)}px`;
  tooltip.classList.add('visible');
}

function hideNoteTooltip() {
  const tooltip = document.getElementById('note-tooltip');
  tooltip.classList.remove('visible');
}

document.getElementById('note-tooltip-close').addEventListener('click', hideNoteTooltip);
document.querySelector('.note-tooltip-edit').addEventListener('click', function() {
  vscode.postMessage({ type: 'revealNote', noteId: this.dataset.noteId });
  hideNoteTooltip();
});

// Hide tooltip on click elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('#note-tooltip') && !e.target.closest('.ai-note-line')) {
    hideNoteTooltip();
  }
});

// ── Messages from extension host ──
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'update') {
    renderAll(msg.text);
  }
});
