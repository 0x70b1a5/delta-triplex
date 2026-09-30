// Saved progress stays with its own puzzle when another one opens.
const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
function tap(h, index) {
  const board = h.d.getElementById('rotate-board');
  board.setPointerCapture = () => {};
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new h.w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: 200, clientY: 200, pointerId: 1, button: 0 });
    (type === 'pointerdown' ? board.querySelector(`[data-cell="${index}"]`) : board).dispatchEvent(event);
    h.flush();
  }
}
function load(h, text) {
  h.click('load-puzzle');
  h.d.getElementById('puzzle-code').value = text;
  h.d.getElementById('load-code-form').dispatchEvent(new h.w.Event('submit', { cancelable: true }));
  h.frame();
}
(async () => {
  const h = harness(source), { w } = h;
  const marks = key => JSON.parse(w.localStorage.getItem('tri-endless-v2')).puzzles[key]?.marks;
  h.click('endless-mode');
  h.d.querySelector('[data-difficulty="4"]').click();
  await h.settle(() => h.state.custom && w.triActiveEndless === 'sprout-1');
  tap(h, 0);
  h.advance(5000);
  assert.equal(marks('sprout-1')[0], '1');
  const first = marks('sprout-1');
  h.click('return-home');
  await h.settle(() => w.location.hash === '');
  h.advance(5000);
  load(h, 'sprout-2');
  await h.settle(() => w.triActiveEndless === 'sprout-2' && h.state.custom);
  h.advance(5000);
  assert.equal(marks('sprout-1'), first, 'opening Sprout #2 leaves Sprout #1 alone');
  assert.equal(h.state.cells[0].state, 0, 'Sprout #2 starts empty');
  tap(h, 1);
  h.advance(5000);
  assert.equal(marks('sprout-2')[1], '1');
  assert.equal(marks('sprout-1'), first, 'playing Sprout #2 leaves Sprout #1 alone');
  h.close();
  console.log('save target tests passed');
})().catch(error => { console.error(error); process.exit(1); });
