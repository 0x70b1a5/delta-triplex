const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const palette = require('./palette.js');
function paintedNumeral(color, stage, glow, mode) {
  if (mode === "colorful") return palette.mix(color, "#ffffff", Math.min(1, glow * 3));
  return palette.flash(color, stage, glow, mode);
}
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
h.startPuzzle();
{
  const labels = [...svg.querySelectorAll('text[data-axis]')];
  const groups = new Map();
  for (const label of labels) {
    const key = `${label.dataset.axis}:${label.dataset.row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(label);
  }
  const clue = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  assert(clue.length >= 2, 'a visible clue has numerals to carry the ripple');
  const outward = [...clue].sort((a, b) => Number(a.dataset.run) - Number(b.dataset.run));
  for (let i = 1; i < outward.length; i++)
    assert(distanceFromCenter(outward[i]) > distanceFromCenter(outward[i - 1]) + .5, 'run 0 is the numeral nearest the board');
  const endpoint = Number(outward[0].dataset.endpoint);
  const fromEdge = new Map([[endpoint, 0]]), edgeQueue = [endpoint];
  for (const from of edgeQueue) for (let to = 0; to < points.length; to++) {
    if (!fromEdge.has(to) && points[from].filter(p => points[to].includes(p)).length === 2) {
      fromEdge.set(to, fromEdge.get(from) + 1); edgeQueue.push(to);
    }
  }
  tap(endpoint, 0);
  h.frame(55 + 20);
  const echoed = () => [...svg.querySelectorAll(`text[data-axis="${outward[0].dataset.axis}"][data-row="${outward[0].dataset.row}"]`)];
  let nearest = echoed().find(label => Number(label.dataset.run) === 0);
  const cellColor = d.documentElement.style.getPropertyValue('--cell');
  assert(Number(nearest.dataset.glow) > 0, 'the numeral beside the edge flashes after that cell');
  assert.equal(Number(nearest.dataset.flashStage), 1, 'the first numeral takes the next rainbow stage');
  assert.equal(nearest.getAttribute('fill'), paintedNumeral(cellColor, 1, Number(nearest.dataset.glow), mode));
  if (mode === "colorful") assert(nearest.getAttribute('fill') !== cellColor, 'a colorful numeral brightens toward white');
  else assert(nearest.getAttribute('fill') !== cellColor, 'a light or dark numeral takes the rainbow');
  assert.equal(Number(echoed().find(label => Number(label.dataset.run) === 1).dataset.glow), 0, 'the next numeral waits one hop');
  const shell = [...fromEdge].find(([, distance]) => distance === 1);
  assert(shell, 'the outer cell has a neighbour at the next hop');
  assert.equal(Number(nearest.dataset.glow), glow(shell[0]), 'a numeral pulses like the cell at the same hop');
  h.frame(55);
  const second = echoed().find(label => Number(label.dataset.run) === 1);
  assert(Number(second.dataset.glow) > 0, 'the next numeral flashes on the following hop');
  assert.equal(Number(second.dataset.flashStage), 2);
  assert.equal(second.getAttribute('fill'), paintedNumeral(cellColor, 2, Number(second.dataset.glow), mode));
  h.click('undo');
  w.matchMedia('(prefers-reduced-motion: reduce)').change(true); h.frame();
  tap(endpoint, 0); h.frame(55 + 20);
  assert([...svg.querySelectorAll('text[data-axis]')].every(label => Number(label.dataset.glow) === 0), 'reduced motion does not flash numerals from a tap');
  h.click('undo');
  w.matchMedia('(prefers-reduced-motion: reduce)').change(false); h.frame();
}
tap(0, 0); h.frame(1000);
tap(0); h.frame(32); assert.equal(glow(0), 0, 'crossing does not start a fill ripple');
assert.equal(svg.querySelector('[data-cell="0"]').getAttribute('fill-opacity'), '0.5', 'crossed background has half opacity');
assert.equal(svg.querySelector('[data-cell="1"]').getAttribute('fill-opacity'), '1', 'unmarked background stays opaque');
const cross = [...svg.querySelectorAll('text')].find(node => node.textContent === '×');
assert(cross && !cross.hasAttribute('opacity') && !cross.hasAttribute('fill-opacity'), 'cross glyph stays opaque');
const crossedBackground = palette.mix(d.documentElement.style.getPropertyValue('--bg'), d.documentElement.style.getPropertyValue('--empty'), .5);
assert(palette.contrast(crossedBackground, cross.getAttribute('fill')) >= 4.5, 'cross contrasts with its composited background');
h.click('undo'); h.frame();
assert.equal(svg.querySelector('[data-cell="0"]').getAttribute('fill-opacity'), '1', 'undo restores filled opacity');

function rowOf(cell, axis, n) {
  return axis === 0 ? cell.i : axis === 1 ? cell.j : n - 1 - cell.i - cell.j - cell.o;
}
function numerals(axis, row) {
  return [...svg.querySelectorAll(`text[data-axis="${axis}"][data-row="${row}"]`)]
    .sort((a, b) => Number(a.dataset.flashOrder) - Number(b.dataset.flashOrder));
}
function distanceFromCenter(label) {
  return Math.hypot(Number(label.getAttribute('x')) - Number(label.dataset.centerX), Number(label.getAttribute('y')) - Number(label.dataset.centerY));
}
function paintRow(axis, row) {
  let taps = 0;
  for (let i = 0; i < h.state.cells.length; i++) {
    const c = h.state.cells[i];
    if (!c.active || rowOf(c, axis, h.state.n) !== row || c.state === 1) continue;
    const rank = c.i + c.j + c.o;
    if (!h.state.solution[rank * rank + 2 * c.i + c.o]) continue;
    tap(i, 0);
    taps++;
  }
  return taps;
}
function solveVisibleRow(preferMultiple) {
  for (let turn = 0; turn < 3; turn++) {
    const visible = new Set([...svg.querySelectorAll('text[data-axis]')].map(node => Number(node.dataset.axis)));
    const candidates = [];
    for (let axis = 0; axis < 3; axis++) for (let row = 0; row < h.state.n; row++) {
      const clue = h.state.clues[axis][row];
      if (!visible.has(axis) || clue.match) continue;
      if (preferMultiple && clue.runs.length < 2) continue;
      candidates.push({ axis, row, runs: clue.runs.length });
    }
    candidates.sort((a, b) => b.runs - a.runs);
    for (const candidate of candidates) {
      const taps = paintRow(candidate.axis, candidate.row);
      if (h.state.clues[candidate.axis][candidate.row].match && !h.state.won) return { ...candidate, taps };
      for (let i = 0; i < taps; i++) h.click('undo');
    }
    if (!preferMultiple) break;
    h.click('turn-right'); h.frame(500);
  }
  assert.fail('a visible row can be solved without finishing the puzzle');
}
{
  const solved = solveVisibleRow(true);
  h.exports.game_clear_effects();
  const step = w.TriRotation.numeralStep, pulse = w.TriRotation.numeralPulse;
  const cellColor = d.documentElement.style.getPropertyValue('--cell');
  let labels = numerals(solved.axis, solved.row);
  assert(labels.length >= 2, 'the flashed clue has more than one numeral');
  for (let i = 1; i < labels.length; i++)
    assert(distanceFromCenter(labels[i]) < distanceFromCenter(labels[i - 1]) - .5, 'flash order runs from the outside toward the board');
  assert(labels.every(label => label.getAttribute('opacity') === '1' && Number(label.dataset.glow) === 0), 'the flash starts on the following frames');
  h.frame(pulse / 2);
  labels = numerals(solved.axis, solved.row);
  assert(Number(labels[0].dataset.glow) > .9, 'the outer numeral flashes first');
  assert.equal(labels[0].getAttribute('opacity'), '1');
  assert.equal(labels[0].getAttribute('fill'), paintedNumeral(cellColor, 0, Number(labels[0].dataset.glow), mode));
  assert.equal(Number(labels[1].dataset.glow), 0, 'the next numeral waits its turn');
  assert.equal(labels[1].getAttribute('opacity'), '1');
  const intoFall = Math.round(pulse * .4);
  h.frame(intoFall);
  labels = numerals(solved.axis, solved.row);
  {
    const falling = labels[0];
    const glowNow = Number(falling.dataset.glow);
    const paint = w.TriRotation.dimFlashPaint(cellColor, Number(falling.dataset.flashStage), glowNow, mode);
    assert(glowNow > 0 && Number(falling.dataset.flashAmount) > .05 && Number(falling.dataset.flashAmount) < .85, 'the match pulse eases down instead of holding full brightness');
    assert.equal(falling.getAttribute('fill'), paint.fill, 'the falling numeral paints the dim-to-flash composite');
    assert.equal(falling.getAttribute('opacity'), '1');
    assert.notEqual(falling.getAttribute('fill'), paintedNumeral(cellColor, Number(falling.dataset.flashStage), glowNow, mode));
  }
  h.frame(step - intoFall);
  labels = numerals(solved.axis, solved.row);
  assert.equal(labels[0].getAttribute('opacity'), '0.5', 'a numeral dims after it flashes');
  assert.equal(Number(labels[0].dataset.glow), 0);
  assert.equal(labels[0].getAttribute('fill'), 'var(--cell)');
  assert(Number(labels[1].dataset.glow) > .9, 'the next numeral flashes after the first');
  assert.equal(labels[1].getAttribute('fill'), paintedNumeral(cellColor, 1, Number(labels[1].dataset.glow), mode));
  h.frame(step * h.state.n + pulse);
  labels = numerals(solved.axis, solved.row);
  assert(labels.every(label => label.getAttribute('opacity') === '0.5' && Number(label.dataset.glow) === 0 && label.getAttribute('fill') === 'var(--cell)'), 'the solved clue rests at half opacity');
  {
    const nearest = labels.slice().sort((a, b) => Number(a.dataset.run) - Number(b.dataset.run))[0];
    const endpoint = Number(nearest.dataset.endpoint);
    const shareEdge = (a, b) => points[a].filter(p => points[b].includes(p)).length === 2;
    const hops = to => {
      const dist = new Map([[endpoint, 0]]), queue = [endpoint];
      for (const from of queue) for (let next = 0; next < points.length; next++) {
        if (!dist.has(next) && shareEdge(from, next)) { dist.set(next, dist.get(from) + 1); queue.push(next); }
      }
      return dist.get(to);
    };
    let probe = -1, probeHops = Infinity;
    for (let i = 0; i < h.state.cells.length; i++) {
      const c = h.state.cells[i];
      if (!c.active || c.state !== 0 || rowOf(c, solved.axis, h.state.n) === solved.row) continue;
      const rank = c.i + c.j + c.o;
      if (h.state.solution[rank * rank + 2 * c.i + c.o]) continue;
      const distance = hops(i);
      if (distance !== undefined && distance < probeHops) { probeHops = distance; probe = i; }
    }
    assert(probe >= 0, 'an empty cell outside the solved row can start a ripple');
    tap(probe, 0);
    assert(h.state.clues[solved.axis][solved.row].match, 'the probe tap leaves the solved row dim');
    const watch = () => numerals(solved.axis, solved.row).find(label => Number(label.dataset.run) === Number(nearest.dataset.run));
    let first = null;
    for (let i = 0; i < 500 && !first; i++) {
      h.frame(4);
      const node = watch();
      if (Number(node.dataset.glow) > 0) first = node;
    }
    assert(first, 'the dim numeral flashes from the ripple');
    const firstGlow = Number(first.dataset.glow);
    const firstPaint = w.TriRotation.dimFlashPaint(cellColor, Number(first.dataset.flashStage), firstGlow, mode);
    assert(firstGlow < .1 && Number(first.dataset.flashAmount) < .25, 'a dim numeral eases out of its half-opacity color');
    assert.equal(first.getAttribute('fill'), firstPaint.fill);
    assert.equal(first.getAttribute('opacity'), '1');
    assert.notEqual(first.getAttribute('fill'), paintedNumeral(cellColor, Number(first.dataset.flashStage), firstGlow, mode));
    let peak = Number(first.dataset.flashAmount), previous = peak, largestStep = 0, rested = false;
    for (let i = 0; i < 250 && !rested; i++) {
      h.frame(8);
      const node = watch();
      const amount = Number(node.dataset.flashAmount);
      const glowNow = Number(node.dataset.glow);
      if (glowNow > 0) {
        const paint = w.TriRotation.dimFlashPaint(cellColor, Number(node.dataset.flashStage), glowNow, mode);
        assert.equal(node.getAttribute('fill'), paint.fill, 'each dim flash frame paints the eased composite');
        largestStep = Math.max(largestStep, Math.abs(amount - previous));
        peak = Math.max(peak, amount);
        previous = amount;
      } else if (peak > .45 && node.getAttribute('opacity') === '0.5' && node.getAttribute('fill') === 'var(--cell)') rested = true;
    }
    assert(peak > .45, 'the eased flash still becomes bright');
    assert(largestStep < .55, 'the visible color does not jump from dim to bright in one step');
    assert(rested, 'the numeral rests dim after the flash');
    h.click('undo');
    h.exports.game_clear_effects();
    h.frame();
  }
  for (const label of svg.querySelectorAll('text[data-axis]')) {
    const matched = h.state.clues[label.dataset.axis][label.dataset.row].match;
    if (Number(label.dataset.axis) === solved.axis && Number(label.dataset.row) === solved.row) continue;
    assert.equal(label.getAttribute('opacity'), matched ? '0.5' : '1', 'only solved clues are dimmed');
  }
  for (let i = 0; i < solved.taps; i++) h.click('undo');
  assert.equal(h.state.clues[solved.axis][solved.row].match, false);
  assert(numerals(solved.axis, solved.row).every(label => label.getAttribute('opacity') === '1'), 'undo restores the clue');
  w.matchMedia('(prefers-reduced-motion: reduce)').change(true); h.frame();
  const quiet = solveVisibleRow(false);
  labels = numerals(quiet.axis, quiet.row);
  assert(labels.every(label => label.getAttribute('opacity') === '0.5' && Number(label.dataset.glow) === 0), 'reduced motion dims a solved clue without flashing');
  h.frame(pulse);
  assert(numerals(quiet.axis, quiet.row).every(label => Number(label.dataset.glow) === 0), 'reduced motion never flashes numerals');
  for (let i = 0; i < quiet.taps; i++) h.click('undo');
  w.matchMedia('(prefers-reduced-motion: reduce)').change(false); h.frame();
}

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
  // The spin always ends on the home view (0 here), adding 120° the shorter way when turned away.
  const extra = [0, 120, -120][(3 - view) % 3], total = extra < 0 ? extra - 360 : extra + 360;
  assert(Math.abs(total) >= 360, 'the reveal is never less than a full turn');
  assert.equal(w.TriRotation.stats.view, 0, 'solving lands on the home view');
  assert(layer.getAttribute('transform').includes(`rotate(${315 * total / 360 - extra}) scale(1.100000`), 'original camera easing and zoom, scaled to reach home');
  h.frame(250); assert(!h.exports.game_celebrating());
  assert.equal(h.exports.game_celebration_angle(), 0);
  assert.equal(h.exports.game_celebration_scale(), 1);
  assert.equal(JSON.stringify(w.TriRotation.stats.finished), result, 'victory effects do not change solve stats');
  h.exports.game_clear_effects(); h.frame();
  const axis = [2, 1, 0][solvedGeometry.desktop ? 0 : 1];
  // That axis starts at the visible point: bottom on desktop, right on mobile.
  const tip = [...svg.querySelectorAll('polygon')].map(p => [Number(p.dataset.cell), p.getAttribute('points').split(' ').map(q => q.split(',').map(Number))])
    .map(([i, pts]) => [i, pts.reduce((sum, q) => sum + q[solvedGeometry.desktop ? 1 : 0], 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const tc = h.state.cells[tip];
  assert.equal(axis === 0 ? tc.i : axis === 1 ? tc.j : h.state.n - 1 - tc.i - tc.j - tc.o, h.state.n - 1, 'the wave axis starts at the visible point');
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
console.log('PASS: completion footer/icons, visible fill ripples, solved-row numeral flashes, finite victory spin/scale that lands on the home view, point-to-base ROYGBIV edge waves, frozen solve stats, fixed victory pivot and reduced motion.');

{
  const h = harness(source, 'https://tri.test/#level=3', {}, { reducedMotion: false });
  const { w, d } = h;
  h.resize(390, 760);
  const svg = d.getElementById('rotate-board');
  svg.setPointerCapture = () => {};
  assert.equal(w.TriRotation.geometry.columns, true, 'a tall phone draws column numerals');
  {
    const groups = new Map();
    for (const label of svg.querySelectorAll('text[data-column]')) {
      const key = `${label.dataset.axis}:${label.dataset.row}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(label);
    }
    const clue = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    assert(clue.length >= 2, 'a column clue has numerals past the edge');
    const endpoint = Number(clue[0].dataset.endpoint);
    const outward = [...clue].sort((a, b) => Number(a.dataset.run) - Number(b.dataset.run));
    const centerDistance = label => Math.hypot(Number(label.getAttribute('x')) - Number(label.dataset.centerX), Number(label.getAttribute('y')) - Number(label.dataset.centerY));
    assert(centerDistance(outward[1]) > centerDistance(outward[0]) + .5, 'column run 0 stays nearest the board');
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 80, clientY: 80 });
      (type === 'pointerdown' ? svg.querySelector(`[data-cell="${endpoint}"]`) : svg).dispatchEvent(event);
      h.frame(type === 'pointerup' ? 75 : 0);
    }
    const nearest = [...svg.querySelectorAll(`text[data-column][data-axis="${outward[0].dataset.axis}"][data-row="${outward[0].dataset.row}"]`)]
      .find(label => Number(label.dataset.run) === 0);
    const following = [...svg.querySelectorAll(`text[data-column][data-axis="${outward[0].dataset.axis}"][data-row="${outward[0].dataset.row}"]`)]
      .find(label => Number(label.dataset.run) === 1);
    assert(Number(nearest.dataset.glow) > 0 && Number(nearest.dataset.flashStage) === 1, 'a column numeral echoes the tap');
    assert.equal(Number(following.dataset.glow), 0, 'the next column numeral waits a hop');
    h.click('undo'); h.exports.game_clear_effects(); h.frame();
  }
  // Turn until a row that was solved from the start is on a visible side.
  const matchedShown = () => [...svg.querySelectorAll('text[data-column]')].some(node => h.state.clues[node.dataset.axis][node.dataset.row].match);
  for (let i = 0; i < 2 && !matchedShown(); i++) { h.click('turn-right'); h.frame(500); h.frame(); }
  const preset = [...svg.querySelectorAll('text[data-column]')].filter(node => h.state.clues[node.dataset.axis][node.dataset.row].match);
  assert(preset.length > 0 && preset.every(node => node.getAttribute('opacity') === '0.5' && Number(node.dataset.glow) === 0), 'rows already solved stay dim');
  function restingColumns() {
    return new Set([...svg.querySelectorAll('text[data-column]')].filter(node => node.getAttribute('opacity') === '0.5' && Number(node.dataset.glow) === 0).map(node => `${node.dataset.axis}:${node.dataset.row}`));
  }
  function assertRailDim() {
    const resting = restingColumns();
    let dimmed = 0;
    for (const rail of svg.querySelectorAll('path[data-rail]')) {
      const ids = (rail.dataset.columns || '').split(',').filter(Boolean);
      const both = ids.length >= 2 && ids.every(id => resting.has(id));
      if (both) {
        dimmed++;
        assert.equal(rail.getAttribute('opacity'), '0.5', 'the line between two dim columns is dim');
        assert.equal(rail.dataset.dim, '1');
        const gradient = /url\(#([^)]+)\)/.exec(rail.getAttribute('stroke'))[1];
        assert.deepEqual([...svg.querySelector('#' + gradient).querySelectorAll('stop')].map(stop => stop.getAttribute('stop-opacity')), ['0', '1', '1'], 'a dim line keeps its fade and only drops in strength');
      } else {
        assert.equal(rail.hasAttribute('opacity'), false, 'a line beside an unsolved or still-flashing column stays bright');
        assert.equal(rail.dataset.dim, undefined);
      }
    }
    return dimmed;
  }
  assertRailDim();
  function rowOf(cell, axis, n) {
    return axis === 0 ? cell.i : axis === 1 ? cell.j : n - 1 - cell.i - cell.j - cell.o;
  }
  const visible = new Set([...svg.querySelectorAll('text[data-column]')].map(node => Number(node.dataset.axis)));
  let choice = null;
  for (let axis = 0; axis < 3 && !choice; axis++) for (let row = 0; row < h.state.n; row++) {
    const clue = h.state.clues[axis][row];
    if (visible.has(axis) && !clue.match && clue.runs.length >= 2) { choice = { axis, row }; break; }
  }
  assert(choice, 'a column clue has several numerals');
  for (let i = 0; i < h.state.cells.length; i++) {
    const c = h.state.cells[i];
    if (!c.active || rowOf(c, choice.axis, h.state.n) !== choice.row) continue;
    const rank = c.i + c.j + c.o;
    if (!h.state.solution[rank * rank + 2 * c.i + c.o]) continue;
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 120, clientY: 120 });
      (type === 'pointerdown' ? svg.querySelector(`[data-cell="${i}"]`) : svg).dispatchEvent(event);
      h.frame(0);
    }
  }
  assert.equal(h.state.clues[choice.axis][choice.row].match, true);
  assert.equal(h.state.won, false);
  h.exports.game_clear_effects();
  const labels = () => [...svg.querySelectorAll(`text[data-column][data-axis="${choice.axis}"][data-row="${choice.row}"]`)]
    .sort((a, b) => Number(a.dataset.flashOrder) - Number(b.dataset.flashOrder));
  h.frame(w.TriRotation.numeralPulse / 2);
  const flashing = labels();
  assert(flashing.length >= 2);
  const centerDistance = label => Math.hypot(Number(label.getAttribute('x')) - Number(label.dataset.centerX), Number(label.getAttribute('y')) - Number(label.dataset.centerY));
  assert(centerDistance(flashing[1]) < centerDistance(flashing[0]) - .5, 'column numerals flash from the outside inward');
  assert(Number(flashing[0].dataset.glow) > .9 && flashing[1].getAttribute('opacity') === '1' && Number(flashing[1].dataset.glow) === 0);
  for (const rail of svg.querySelectorAll('path[data-rail]')) {
    const ids = (rail.dataset.columns || '').split(',');
    if (ids.includes(`${choice.axis}:${choice.row}`)) assert.equal(rail.dataset.dim, undefined, 'a shared line stays bright while one column is still flashing');
  }
  h.frame(w.TriRotation.numeralStep * h.state.n + w.TriRotation.numeralPulse);
  assert(labels().every(label => label.getAttribute('opacity') === '0.5' && Number(label.dataset.glow) === 0), 'a solved column clue dims by half');
  const choiceId = `${choice.axis}:${choice.row}`;
  let partner = null;
  for (const rail of svg.querySelectorAll('path[data-rail]')) {
    const ids = (rail.dataset.columns || '').split(',').filter(Boolean);
    if (ids.length < 2 || !ids.includes(choiceId)) continue;
    const other = ids.find(id => id !== choiceId);
    const [axis, row] = other.split(':').map(Number);
    if (!h.state.clues[axis][row].match) partner = { axis, row, rail };
  }
  if (partner) {
    let needed = 0, elsewhere = 0;
    for (let i = 0; i < h.state.cells.length; i++) {
      const c = h.state.cells[i];
      if (!c.active || c.state === 1) continue;
      const rank = c.i + c.j + c.o;
      if (!h.state.solution[rank * rank + 2 * c.i + c.o]) continue;
      if (rowOf(c, partner.axis, h.state.n) === partner.row) needed++;
      else elsewhere++;
    }
    assert(needed > 0 && elsewhere > 0, 'solving the neighbor does not finish the puzzle');
    for (let i = 0; i < h.state.cells.length; i++) {
      const c = h.state.cells[i];
      if (!c.active || c.state === 1 || rowOf(c, partner.axis, h.state.n) !== partner.row) continue;
      const rank = c.i + c.j + c.o;
      if (!h.state.solution[rank * rank + 2 * c.i + c.o]) continue;
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new w.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 140, clientY: 140 });
        (type === 'pointerdown' ? svg.querySelector(`[data-cell="${i}"]`) : svg).dispatchEvent(event);
        h.frame(0);
      }
    }
    assert.equal(h.state.clues[partner.axis][partner.row].match, true);
    assert.equal(h.state.won, false);
    h.exports.game_clear_effects();
    h.frame(w.TriRotation.numeralPulse / 2);
    const shared = [...svg.querySelectorAll('path[data-rail]')].find(rail => {
      const ids = (rail.dataset.columns || '').split(',');
      return ids.includes(choiceId) && ids.includes(`${partner.axis}:${partner.row}`);
    });
    assert(shared && shared.dataset.dim === undefined, 'the shared line waits until both columns have settled');
    h.frame(w.TriRotation.numeralStep * h.state.n + w.TriRotation.numeralPulse);
    const settled = [...svg.querySelectorAll('path[data-rail]')].find(rail => {
      const ids = (rail.dataset.columns || '').split(',');
      return ids.includes(choiceId) && ids.includes(`${partner.axis}:${partner.row}`);
    });
    assert.equal(settled.getAttribute('opacity'), '0.5', 'the shared line dims once both columns rest');
    assert.equal(settled.dataset.dim, '1');
  }
  assert(assertRailDim() > 0, 'at least one border between dim columns is dim');
  h.close();
}
console.log('PASS: column clues flash one by one and then sit at half opacity.');

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
