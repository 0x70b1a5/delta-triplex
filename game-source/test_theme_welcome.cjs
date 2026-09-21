const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
for (const mode of ['light', 'dark', 'system', 'colorful']) {
  const h = harness(source, 'https://tri.test/', {}, {firstGame: true});
  const dialog = h.d.getElementById('theme-welcome');
  assert(!dialog.open, 'menu does not prompt before starting');
  h.startPuzzle();
  assert(dialog.open);
  assert.equal(dialog.querySelector('input:checked').value, 'system');
  assert.equal(dialog.querySelectorAll('svg').length, 4);
  assert(h.d.getElementById('app').inert);
  h.frame(30000);
  assert.equal(h.w.TriRotation.stats.elapsed, 0, 'chooser time does not count as play');
  const choice = dialog.querySelector(`input[value="${mode}"]`);
  choice.checked = true; choice.dispatchEvent(new h.w.Event('change'));
  assert.equal(h.d.getElementById('theme-mode').value, mode);
  assert.equal(h.w.localStorage.getItem('delta-triplex-theme'), mode);
  dialog.querySelector('form').dispatchEvent(new h.w.Event('submit', {cancelable:true}));
  h.frame();
  assert(!dialog.open); assert(!h.d.getElementById('app').inert);
  assert.equal(h.w.localStorage.getItem('delta-triplex-theme-welcome'), '1');
  h.click('return-home'); h.startPuzzle();
  assert(!dialog.open, 'only once per browser');
  const restored = harness(source, 'https://tri.test/#level=1', {
    'delta-triplex-theme': mode, 'delta-triplex-theme-welcome': '1',
  }, {firstGame: true});
  assert(!restored.d.getElementById('theme-welcome').open);
  restored.close(); h.close();
}
{
  const h = harness(source, 'https://tri.test/#level=2', {'delta-triplex-theme':'dark'}, {firstGame: true});
  const dialog = h.d.getElementById('theme-welcome');
  assert(dialog.open, 'direct puzzle links prompt too');
  assert.equal(dialog.querySelector('input:checked').value, 'dark', 'saved theme is preselected');
  dialog.dispatchEvent(new h.w.Event('cancel', {cancelable:true}));
  assert(!dialog.open); assert.equal(h.state.level, 2);
  assert(!h.d.getElementById('app').inert, 'Escape continues with current choice');
  h.close();
}
console.log('PASS: first-game previews, live theme choice, paused clock, once-only persistence, shared links and Escape.');
