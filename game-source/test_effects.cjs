const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const palette = require('./palette.js');
for (const mode of ['light', 'dark', 'colorful']) {
const darkMode = mode === 'dark';
const h = harness(source, 'https://tri.test/', {'delta-triplex-theme': mode}, { reducedMotion: false, darkMode });
const { w, d } = h;
h.startPuzzle();
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
assert.equal(svg.querySelector('[data-cell="0"]').getAttribute('fill'), palette.flash(d.documentElement.style.getPropertyValue('--cell'), 0, glow(0), mode), 'tap begins red in both themes');
// Build an independent graph from shared triangle vertices, then verify
// every outward tap stage and its rendered colour (including the violet tip).
h.startPuzzle(); tap(0);
const vertices = ({i, j, o}) => (o ? [[i+1,j], [i,j+1], [i+1,j+1]] : [[i,j], [i,j+1], [i+1,j]])
  .map(p => p.join(','));
const points = h.state.cells.map(vertices), distances = new Map([[0, 0]]), queue = [0];
for (const from of queue) for (let to = 0; to < points.length; to++) {
  if (!distances.has(to) && points[from].filter(p => points[to].includes(p)).length === 2) {
    distances.set(to, distances.get(from) + 1); queue.push(to);
  }
}
assert.equal(Math.max(...distances.values()), 6, 'four-row tap traverses all seven rainbow stages');
h.frame(35);
for (let stage = 0; stage < 7; stage++) {
  for (const [index, distance] of distances) if (distance === stage) {
    const cell = svg.querySelector(`[data-cell="${index}"]`);
    assert(glow(index) > 0, 'tap reaches each edge-adjacent shell');
    assert.equal(+cell.dataset.flashStage, stage);
    const base = d.documentElement.style.getPropertyValue(h.state.cells[index].state === 1 ? '--cell' : '--empty');
    assert.equal(cell.getAttribute('fill'), palette.flash(base, stage, glow(index), mode));
  }
  h.frame(55);
}
h.frame(1000); assert([...svg.querySelectorAll('polygon')].every(p => +p.dataset.glow === 0), 'fill ripple decays');
tap(0); h.frame(32); assert.equal(glow(0), 0, 'crossing does not start a fill ripple');
assert.equal(svg.querySelector('[data-cell="0"]').getAttribute('fill-opacity'), '0.5', 'crossed background has half opacity');
assert.equal(svg.querySelector('[data-cell="1"]').getAttribute('fill-opacity'), '1', 'unmarked background stays opaque');
const cross = [...svg.querySelectorAll('text')].find(node => node.textContent === '×');
assert(cross && !cross.hasAttribute('opacity') && !cross.hasAttribute('fill-opacity'), 'cross glyph stays opaque');
const crossedBackground = palette.mix(d.documentElement.style.getPropertyValue('--bg'), d.documentElement.style.getPropertyValue('--empty'), .5);
assert(palette.contrast(crossedBackground, cross.getAttribute('fill')) >= 4.5, 'cross contrasts with its composited background');
h.click('undo'); h.frame();
assert.equal(svg.querySelector('[data-cell="0"]').getAttribute('fill-opacity'), '1', 'undo restores filled opacity');

assert(d.getElementById('bottom-controls').contains(d.getElementById('completion')));
assert(d.getElementById('share-result').querySelector('svg'));
assert.equal(d.querySelector('#share-result .desktop-share-label').textContent, 'Share');
assert.equal(d.querySelector('#share-result .mobile-share-suffix').textContent, 'Share solution');
assert.equal(d.getElementById('next-puzzle').textContent, 'Next →');
for (let view = 0; view < 3; view++) {
  h.startPuzzle();
  h.resize(view % 2 ? 390 : 1200, view % 2 ? 480 : 700);
  for (let i = 0; i < view; i++) { h.click('turn-right'); h.frame(500); }
  for (let i = 0; i < h.state.cells.length; i++) {
    const c = h.state.cells[i], r = c.i + c.j + c.o;
    if (c.active && h.state.solution[r * r + 2 * c.i + c.o]) tap(i);
  }
  assert(h.state.won);
  const initialNextFill = d.getElementById('next-puzzle').style.getPropertyValue('--next-fill');
  assert(initialNextFill);
  assert(palette.contrast(initialNextFill, d.getElementById('next-puzzle').style.getPropertyValue('--next-ink')) >= 4.5);
  const solvedGeometry = w.TriRotation.geometry;
  const axisToBalance = solvedGeometry.desktop ? 1 : 0;
  const extent = solvedGeometry.desktop ? solvedGeometry.height : solvedGeometry.width;
  const low = Math.min(...solvedGeometry.outer.map(p => p[axisToBalance]));
  const high = Math.max(...solvedGeometry.outer.map(p => p[axisToBalance]));
  assert(Math.abs(low - (extent - high)) < 1e-6, 'solved board has equal opposite margins');
  assert.equal(svg.querySelectorAll('text[data-axis]').length, 0, 'solved board reserves no clue space');
  if (!solvedGeometry.desktop) assert(Math.abs(low - 8) < 1e-6, 'mobile solved board fills available width');
  assert(h.exports.game_celebrating(), 'solving starts the original engine celebration');
  const result = JSON.stringify(w.TriRotation.stats.finished);
  const startingAngle = w.TriRotation.geometry.angle;
  const startingOuter = JSON.stringify(w.TriRotation.geometry.outer);
  const startingPoints = svg.querySelector('polygon').getAttribute('points');
  const startingPivot = svg.querySelector('[data-board-layer]').dataset.pivot;
  h.frame(250);
  assert.notEqual(d.getElementById('next-puzzle').style.getPropertyValue('--next-fill'), initialNextFill, 'Next draws attention with a hue shift');
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
  for (let step = 0; step < (2 * h.state.n - 1) * 2; step++) {
    if (step) h.frame(1);
    for (let i = 0; i < h.state.cells.length; i++) {
      const c = h.state.cells[i];
      const row = axis === 0 ? c.i : axis === 1 ? c.j : h.state.n - 1 - c.i - c.j - c.o;
      const distance = 2 * (h.state.n - 1 - row) - c.o;
      const lit = distance === step % (2 * h.state.n - 1);
      assert.equal(glow(i) > .05, lit, 'shared-edge waves flash from the visible point and loop');
      if (lit) {
        const base = d.documentElement.style.getPropertyValue(c.state === 1 ? '--cell' : '--empty');
        assert.equal(svg.querySelector(`[data-cell="${i}"]`).getAttribute('fill'), palette.flash(base, step, glow(i), mode), 'solved wave advances through ROYGBIV');
      }
    }
    h.frame(499);
    assert([...svg.querySelectorAll('polygon')].some(p => +p.dataset.glow > .05), 'a wave stays lit until the next begins');
  }
  h.exports.game_motion(0); h.frame();
  assert([...svg.querySelectorAll('polygon')].every(p => +p.dataset.glow === 0));
  h.exports.game_celebrate(); assert(!h.exports.game_celebrating());
  h.exports.game_motion(1);
  w.matchMedia('(prefers-reduced-motion: reduce)').change(true); h.frame();
  const stillFill = d.getElementById('next-puzzle').style.getPropertyValue('--next-fill');
  h.frame(500);
  assert.equal(d.getElementById('next-puzzle').style.getPropertyValue('--next-fill'), stillFill, 'Next respects reduced motion');
  w.matchMedia('(prefers-reduced-motion: reduce)').change(false); h.frame();
  h.click('next-puzzle');
  assert(!d.getElementById('home').hidden, 'completed legacy stock puzzles return home');
  assert.equal(d.getElementById('next-puzzle').textContent, 'Next →', 'Next keeps its label after navigation');
  assert(d.getElementById('next-puzzle').style.getPropertyValue('--next-fill'));
}
h.close();
}
console.log('PASS: completion footer/icons, visible fill ripples, finite victory spin/scale, rotated point-to-base ROYGBIV edge waves, frozen solve stats, fixed victory pivot and reduced motion.');

// All three playable lessons must spin around their geometric centre, including
// the nine-cell lesson whose centroid falls between cell centres.
for (const width of [390, 1000]) {
  const h = harness(source, 'https://tri.test/', {}, { reducedMotion:false });
  const {w,d}=h;
  h.resize(width,760); h.click('how-to-play');
  for(let i=0;i<4;i++) h.click('intro-next');
  const board=d.getElementById('rotate-board'); board.setPointerCapture=()=>{};
  for(let lesson=0;lesson<3;lesson++) {
    assert.equal(h.state.tutorial,lesson);
    for(let index=0;index<h.state.cells.length;index++) {
      const c=h.state.cells[index], row=c.i+c.j+c.o;
      if(!h.state.solution[row*row+2*c.i+c.o])continue;
      const target=board.querySelector(`[data-cell="${index}"]`);
      for(const type of ['pointerdown','pointerup']) {
        const event=new w.Event(type,{bubbles:true,cancelable:true});
        Object.assign(event,{pointerId:1,pointerType:'touch',button:0,clientX:200,clientY:200});
        (type === 'pointerdown' ? target : board).dispatchEvent(event);h.frame();
      }
    }
    assert(h.state.won);
    for(const elapsed of [0,100,150]) {
      h.frame(elapsed);
      const pivot=board.querySelector('[data-board-layer]').dataset.pivot.split(',').map(Number);
      for(const axis of [0,1]) {
        const centroid=w.TriRotation.geometry.outer.reduce((sum,p)=>sum+p[axis],0)/3;
        assert(Math.abs(pivot[axis]-centroid)<1e-6, `lesson ${lesson+1} celebration uses the triangle centroid`);
      }
    }
    h.frame(300);h.click('next-puzzle');
  }
  h.close();
}
console.log('PASS: centered completion spins for all three playable tutorials on desktop and mobile.');
