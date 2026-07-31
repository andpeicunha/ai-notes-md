const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { findSelectedTextRangeInText } = require('../dist/preview-editor');

test('maps rendered preview text back to the original markdown line', () => {
  const lines = Array.from({ length: 103 }, (_, index) => `line ${index + 1}`);
  lines.push('- O link e **publico** e **nao identifica o aluno individualmente**. Qualquer pessoa com o link ve a grade de aulas da academia.');
  lines.push('- A academia compartilha o link em grupos fechados de WhatsApp.');

  const fullText = lines.join('\n');
  const selectedText = 'O link e publico e nao identifica o aluno individualmente. Qualquer pessoa com o link ve a grade de aulas da academia.';

  const match = findSelectedTextRangeInText(fullText, selectedText);

  assert.ok(match);
  assert.equal(match.text, lines[103]);
  assert.equal(fullText.slice(0, match.start).split('\n').length, 104);
});
