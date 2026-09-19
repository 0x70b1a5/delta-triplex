const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const h = harness(source, 'https://tri.test/', {}, { reducedMotion: false });
const { w, d } = h;
h.click('new-game');
const svg = d.getElementById('rotate-board');
svg.setPointerCapture = () => {};
function tap(index, releaseFrameDelay = 0) {
  const target = svg.querySelector(`[data-cell="${index}"]`);
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 200, clientY: 200 });
    (type === 'pointerdown' ? target : svg).dispatchEvent(event); h.frame(type === 'pointerup' ? releaseFrameDelay : 0);
  }
}
const glow = index => +svg.querySelector(`[data-cell="${index}"]`).dataset.glow;
tap(0, 16);
assert(glow(0) > 0, 'ripple is visible on the first frame after the tap commits');
h.frame(32);
assert(glow(0) > .1, 'filled cells visibly pulse in the SVG renderer');
assert(svg.querySelector('[data-cell="0"]').getAttribute('fill').startsWith('rgb('));
h.frame(1000); assert([...svg.querySelectorAll('polygon')].every(p => +p.dataset.glow === 0), 'fill ripple decays');
tap(0); h.frame(32); assert.equal(glow(0), 0, 'crossing does not start a fill ripple');
assert(d.getElementById('bottom-controls').contains(d.getElementById('completion')));
assert(d.getElementById('share-result').querySelector('svg'));
assert.equal(d.getElementById('share-result').textContent.trim(), 'Share solution');
assert(d.getElementById('next-puzzle').querySelector('svg'));
assert.equal(d.getElementById('next-puzzle').textContent.trim(), '');
for (let view = 0; view < 3; view++) {
  h.click('new-game');
  h.resize(view % 2 ? 390 : 1200, view % 2 ? 480 : 700);
  for (let i = 0; i < view; i++) { h.click('turn-right'); h.frame(500); }
  for (let i = 0; i < h.state.cells.length; i++) {
    const c = h.state.cells[i], r = c.i + c.j + c.o;
    if (c.active && h.state.solution[r * r + 2 * c.i + c.o]) tap(i);
  }
  assert(h.state.won);
  const solvedGeometry = w.TriRotation.geometry;
  const axisToBalance = solvedGeometry.desktop ? 1 : 0;
  const extent = solvedGeometry.desktop ? solvedGeometry.height : solvedGeometry.width;
  const low = Math.min(...solvedGeometry.outer.map(p => p[axisToBalance]));
  const high = Math.max(...solvedGeometry.outer.map(p => p[axisToBalance]));
  assert(Math.abs(low - (extent - high)) < 1e-6, 'solved board has equal opposite margins');
  assert.equal(svg.querySelectorAll('text[data-axis]').length, 0, 'solved board reserves no clue space');
  if (!solvedGeometry.desktop) assert(Math.abs(low - 24) < 1e-6, 'mobile solved board fills available width');
  assert(h.exports.game_celebrating(), 'solving starts the original engine celebration');
  const result = JSON.stringify(w.TriRotation.stats.finished);
  const startingAngle = w.TriRotation.geometry.angle;
  const startingOuter = JSON.stringify(w.TriRotation.geometry.outer);
  const startingPoints = svg.querySelector('polygon').getAttribute('points');
  const startingPivot = svg.querySelector('[data-board-layer]').dataset.pivot;
  h.frame(250);
  assert(Math.abs(h.exports.game_celebration_angle() - 315) < .01);
  assert(Math.abs(h.exports.game_celebration_scale() - 1.1) < .001);
  assert.equal(w.TriRotation.geometry.angle, startingAngle, 'victory does not change ordinary rotation geometry');
  assert.equal(JSON.stringify(w.TriRotation.geometry.outer), startingOuter, 'no edge reanchoring or fitting during victory');
  assert.equal(svg.querySelector('polygon').getAttribute('points'), startingPoints, 'the camera transforms the entire board, including gaps');
  const layer = svg.querySelector('[data-board-layer]');
  assert.equal(layer.dataset.pivot, startingPivot, 'victory pivot stays fixed');
  assert(layer.getAttribute('transform').includes('rotate(315) scale(1.100000'), 'original camera angle and zoom are applied without clamping');
  h.frame(250); assert(!h.exports.game_celebrating());
  assert.equal(h.exports.game_celebration_angle(), 0);
  assert.equal(h.exports.game_celebration_scale(), 1);
  assert.equal(JSON.stringify(w.TriRotation.stats.finished), result, 'victory effects do not change solve stats');
  h.exports.game_clear_effects(); h.frame();
  const axis = [2, 1, 0][view];
  for (let step = 0; step < h.state.n * 2; step++) {
    if (step) h.frame(1);
    for (let i = 0; i < h.state.cells.length; i++) {
      const c = h.state.cells[i];
      const row = axis === 0 ? c.i : axis === 1 ? c.j : h.state.n - 1 - c.i - c.j - c.o;
      assert.equal(glow(i) > .05, row === h.state.n - 1 - step % h.state.n, 'whole rows flash from the visible point and loop');
    }
    h.frame(499);
    assert([...svg.querySelectorAll('polygon')].some(p => +p.dataset.glow > .05), 'a row stays lit until the next begins');
  }
  h.exports.game_motion(0); h.frame();
  assert([...svg.querySelectorAll('polygon')].every(p => +p.dataset.glow === 0));
  h.exports.game_celebrate(); assert(!h.exports.game_celebrating());
  h.exports.game_motion(1);
  h.click('next-puzzle');
  assert.equal(h.state.level, 1);
  assert(!h.state.won);
  assert(d.getElementById('next-puzzle').querySelector('svg'), 'Next keeps its icon after navigation');
  assert.equal(d.getElementById('next-puzzle').textContent.trim(), '');
}
h.close();
console.log('PASS: completion footer/icons, visible fill ripples, finite victory spin/scale, rotated point-to-base row flashes, frozen solve stats, fixed victory pivot and reduced motion.');
