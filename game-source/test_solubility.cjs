const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
// The editor warns, after painting pauses, when a drawn board's clues have
// several answers or need guessing; Try hides the warning.
const draft = solution => ({ 'tri-rotate-editor-v1': JSON.stringify({ size: 3, solution }) });
const checks = h => { for (const [id, t] of [...h.timers]) if (t.ms === 200) { h.timers.delete(id); t.fn(); } h.flush(); };
const button = h => h.d.getElementById('editor-solubility');
{
  const h = harness(source);
  const ask = s => h.w.__bridge.ccall('game_solubility', 'number', ['number', 'string'], [3, s]);
  assert.equal(ask('000101000'), 2, 'three size-3 boards share these clues');
  assert.equal(ask('110010001'), 0, 'line solvable');
  assert.equal(ask('11001'), -1, 'malformed input');
  h.close();
}
{
  const h = harness(source, 'https://tri.test/', draft([0, 0, 0, 1, 0, 1, 0, 0, 0]));
  h.click('create-puzzle');
  h.click('new-puzzle-continue');
  assert(h.state.editing);
  assert(button(h).hidden, 'no warning until painting pauses');
  checks(h);
  assert(!button(h).hidden);
  assert.equal(button(h).textContent, '! Unsolvable');
  h.click('editor-solubility');
  const dialog = h.d.getElementById('solubility-dialog');
  assert(dialog.open);
  assert.equal(h.d.getElementById('solubility-title').textContent, 'More than one answer');
  h.click('solubility-close');
  assert(!dialog.open);
  h.click('editor-test');
  assert(!h.state.editing);
  assert(button(h).hidden, 'Try hides the warning');
  h.click('editor-test');
  assert(!button(h).hidden, 'returning to Edit reuses the cached result');
  h.close();
}
{
  const h = harness(source, 'https://tri.test/', draft([1, 1, 0, 0, 1, 0, 0, 0, 1]));
  h.click('create-puzzle');
  h.click('new-puzzle-continue');
  checks(h);
  assert(button(h).hidden, 'line-solvable boards show nothing');
  h.close();
}
console.log('PASS: editor solubility warning, deferred check, dialog, and Try hides it.');
