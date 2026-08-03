const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadRendererHelpers() {
  const source = readFileSync(join(__dirname, '../media/renderer.js'), 'utf8');
  const start = source.indexOf('// ── Parse notes from raw markdown ──');
  const injectEnd = source.indexOf('// ── Annotation toggle bar at top');
  const helperStart = source.indexOf('// Detect block-level Markdown prefix');
  const helperEnd = source.indexOf('// ── Inline comment input panel ──');
  const helperSource = `${source.slice(start, injectEnd)}\n${source.slice(helperStart, helperEnd)}\n({ parseNotes, injectAnnotationMarkers });`;

  return vm.runInNewContext(helperSource, {});
}

test('preview annotations parse multiline Status and Lines fields', () => {
  const { parseNotes, injectAnnotationMarkers } = loadRendererHelpers();
  const markdown = [
    'Line 1',
    'Line 2',
    'Target line',
    '',
    '# AI Notes',
    '',
    '## NOTE-005',
    '',
    'Status:',
    '',
    'pending',
    '',
    'Lines:',
    '',
    '3-3',
    '',
    'Human Comment:',
    '',
    'Preview should mark this line.',
    '',
    'Expected AI Action:',
    '',
    'Not specified.',
    '',
    'Created At:',
    '',
    '2026-08-01'
  ].join('\n');

  const notes = parseNotes(markdown);

  assert.deepEqual(JSON.parse(JSON.stringify(notes)), [
    {
      noteId: 'NOTE-005',
      startLine: 3,
      endLine: 3,
      humanComment: 'Preview should mark this line.',
      createdAt: '2026-08-01'
    }
  ]);
  assert.match(injectAnnotationMarkers(markdown, notes), /<span class="ai-note-line" data-note-id="NOTE-005">Target line/);
});
