const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
// Create, the Level editor and the editor's New button all ask for a name and
// size first; an existing draft can be continued from outside the editor.
const $ = (h, id) => h.d.getElementById(id);
const draft = h => JSON.parse(h.w.localStorage.getItem('tri-rotate-editor-v1'));
{
  const h = harness(source);
  h.click('create-puzzle');
  assert($(h, 'new-puzzle-dialog').open, 'Create asks before opening a grid');
  assert(!h.state.custom);
  assert($(h, 'new-puzzle-continue').hidden && $(h, 'new-puzzle-replaces').hidden, 'nothing to continue or replace');
  $(h, 'new-puzzle-dialog').dispatchEvent(new h.w.Event('cancel', { cancelable: true }));
  assert(!$(h, 'new-puzzle-dialog').open && !h.state.custom, 'Escape stays home');
  h.click('create-puzzle');
  h.click('new-puzzle-cancel');
  assert(!$(h, 'new-puzzle-dialog').open && !h.state.custom);
  h.click('create-puzzle');
  h.newPuzzle({ name: 'Rings', size: 7 });
  assert(h.state.editing && h.state.n === 7);
  assert.equal($(h, 'workshop-title').textContent, 'Editing · Rings');
  assert.equal(draft(h).name, 'Rings');
  assert.equal(draft(h).size, 7);
  assert(!$(h, 'editor-new').hidden, 'New sits beside Try while editing');
  h.click('editor-test');
  assert($(h, 'editor-new').hidden, 'New is hidden while trying');
  h.close();
}
{
  const started = { name: 'Owl', size: 3, solution: [1, 1, 0, 0, 1, 0, 0, 0, 1] };
  const h = harness(source, 'https://tri.test/', { 'tri-rotate-editor-v1': JSON.stringify(started) });
  h.click('create-puzzle');
  assert(!$(h, 'new-puzzle-continue').hidden);
  assert.equal($(h, 'new-puzzle-continue').textContent, 'Continue Owl');
  assert(!$(h, 'new-puzzle-replaces').hidden, 'warns that New replaces the draft');
  assert.equal($(h, 'new-puzzle-size').value, '3', 'size defaults to the draft size');
  h.click('new-puzzle-continue');
  assert(h.state.editing);
  assert.deepEqual(h.state.solution, started.solution, 'the draft reopens unchanged');
  h.click('editor-new');
  assert($(h, 'new-puzzle-dialog').open);
  assert($(h, 'new-puzzle-continue').hidden, 'the draft is already open in the editor');
  h.click('new-puzzle-cancel');
  assert.deepEqual(h.state.solution, started.solution, 'cancel keeps the draft');
  h.click('editor-new');
  h.newPuzzle({ size: 4 });
  assert(h.state.editing && h.state.n === 4 && h.state.solution.every(v => !v), 'a blank board');
  assert.equal(draft(h).name, 'My puzzle', 'a blank name uses the default');
  assert(draft(h).solution.every(v => !v), 'the draft is replaced');
  h.click('menu-toggle');
  h.click('editor-open');
  assert($(h, 'new-puzzle-dialog').open, 'the Level editor entry asks too');
  h.close();
}
console.log('PASS: New puzzle dialog from Create, the Level editor and the editor, with continue, cancel and replacement.');
