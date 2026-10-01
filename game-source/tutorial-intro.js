"use strict";
// An isolated demonstration: never writes marks or rotations into the game engine.
// Clues are placed by the game's own geometry (TriBoardGeometry in rotate.js),
// so the lesson board always lays out its hints the way a real puzzle does.
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const root = el('tutorial-intro'), board = el('intro-board');
  const N = 5, SCALE = 240;
  // Solution in lesson order (rows from the tip, left to right). Chosen so the
  // visible hints include multi-number runs, solving takes four rounds of line
  // deduction, and one turn to the third direction is required.
  const SOLUTION = '1011001011100011000111110';
  const cells = [];
  for (let row = 0; row < N; row++) for (let k = 0; k <= 2 * row; k++) {
    const i = Math.floor(k / 2), o = k % 2, j = row - i - o;
    cells.push({ i, j, o, active: true, filled: SOLUTION[cells.length] === '1' });
  }
  // Engine conventions: row index per axis, and runs ordered along each strip.
  const axisRow = (c, axis) => axis === 0 ? c.i : axis === 1 ? c.j : N - 1 - c.i - c.j - c.o;
  const along = (c, axis) => 2 * (axis === 0 ? c.j : c.i) + c.o;
  function strip(axis, r) {
    const ids = cells.map((c,id) => id).filter(id => axisRow(cells[id], axis) === r)
      .sort((a,b) => along(cells[a], axis) - along(cells[b], axis));
    const runs = []; let run = 0;
    for (const id of ids) { if (cells[id].filled) run++; else if (run) { runs.push(run); run = 0; } }
    if (run) runs.push(run);
    return { ids, runs: runs.length ? runs : [0], axis, r };
  }
  const strips = [0,1,2].map(axis => Array.from({ length: N }, (_, r) => strip(axis, r)));
  // The lessons use the two directions visible at the resting pose.
  const rows = [];
  for (let r = 0; r < N; r++) for (let axis = 0; axis < 2; axis++) rows.push(strips[axis][r]);
  const demo = { n: N, cells, clues: strips.map(axis => axis.map(line => ({ runs: line.runs[0] ? line.runs : [] }))) };
  // Directions whose hints show after each whole turn, as on the rotation page.
  const VISIBLE = [[0,1],[0,2],[1,2]];
  const runsText = line => line.runs.join(' ');
  // Every placement of a strip's runs consistent with its marks (1 filled, 2 crossed):
  // cells filled in all of them are forced full, cells filled in none forced empty.
  function deduce(line, marks) {
    const size = line.ids.length, target = line.runs.join();
    let any = 0, all = (1 << size) - 1;
    for (let bits = 0; bits < 1 << size; bits++) {
      const runs = []; let run = 0;
      for (let p = 0; p <= size; p++) {
        if (p < size && bits >> p & 1) run++;
        else if (run) { runs.push(run); run = 0; }
      }
      if ((runs.length ? runs : [0]).join() !== target) continue;
      if (line.ids.some((id, p) => marks[id] && (marks[id] === 1) !== !!(bits >> p & 1))) continue;
      any |= bits; all &= bits;
    }
    const fill = [], cross = [];
    line.ids.forEach((id, p) => {
      if (marks[id]) return;
      if (all >> p & 1) fill.push(id);
      else if (!(any >> p & 1)) cross.push(id);
    });
    return { fill, cross };
  }
  // How the lesson explains a strip's new marks.
  function reason(line, before, fill, cross) {
    const known = line.ids.filter(id => before[id]).length;
    const done = known + fill.length + cross.length === line.ids.length;
    if (!known && line.runs[0] === 0) return 'empty';
    if (!known && done) return line.runs.length > 1 ? 'exact' : 'fill';
    if (!known) return 'overlap';
    const filled = line.ids.filter(id => before[id] === 1).length;
    if (!fill.length && done && filled === line.runs.reduce((a,b) => a+b, 0)) return 'cross';
    return done ? 'fit' : 'narrow';
  }
  // Work the strip that settles the most cells among the visible hints, preferring
  // longer strips; when no visible hint helps, turn to reveal the next direction.
  const marks = Array(cells.length).fill(0), steps = [];
  let turn = 0;
  while (marks.includes(0)) {
    let best = null;
    for (const axis of VISIBLE[turn % 3]) for (const line of strips[axis]) {
      const { fill, cross } = deduce(line, marks), count = fill.length + cross.length;
      if (count && (!best || count > best.count || (count === best.count && line.ids.length > best.line.ids.length)))
        best = { line, fill, cross, count };
    }
    if (!best) {
      if (++turn > 3) throw Error('The lesson board cannot be solved by line deduction.');
      steps.push({ turn, marks: marks.slice() });
      continue;
    }
    const { line, fill, cross } = best, why = reason(line, marks, fill, cross);
    fill.forEach(id => { marks[id] = 1; });
    cross.forEach(id => { marks[id] = 2; });
    steps.push({ axis: line.axis, r: line.r, fill, cross, reason: why, turn, marks: marks.slice() });
  }
  window.TriIntroDemo = { cells, rows, strips, steps };
  // Match the game's 420 ms smoothstep turn, with time to read between turns.
  const TURN_MS = 420, REST_MS = 1800;
  let page = 0, beat = 0, timer = 0, paused = false, frame = 0;
  // Solve and rotation pages: whole turns taken, the turn in flight, and a drag's live preview in degrees.
  let turns = 0, turning = null, preview = 0, restSince = 0, gesture = null, wheelAmount = 0, wheelLast = -Infinity;
  let returnToPuzzle = false;
  function leaveIntro() {
    const backToPuzzle = returnToPuzzle;
    returnToPuzzle = false;
    window.triCloseIntro();
    if (backToPuzzle) window.triShowPlay();
    else window.triShowHome();
  }
  function svg(tag, attrs, parent = board) {
    const node = document.createElementNS(ns, tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node); return node;
  }
  const solved = () => page === 2 && beat === steps.length;
  const autoplaying = () => motionEnabled && !paused && !root.hidden && !document.hidden;
  function stop() { clearTimeout(timer); timer = 0; cancelAnimationFrame(frame); frame = 0; }
  function schedule() {
    stop();
    if (root.hidden || document.hidden || page === 0) return;
    if (page === 3 || turning) { if (turning || autoplaying()) frame = requestAnimationFrame(animate); return; }
    if (!autoplaying() || solved()) return;
    timer = setTimeout(() => { if (page === 1) beat = (beat + 1) % rows.length; else showBeat(beat + 1); draw(); schedule(); }, page === 1 ? 1800 : 2400);
  }
  function animate() {
    frame = 0;
    const now = performance.now();
    if (turning && now - turning.start >= TURN_MS) { turning = null; restSince = now; }
    if (page === 3 && !turning && !gesture && autoplaying() && now - restSince >= REST_MS) turnBy(1, true);
    else { draw(); schedule(); }
  }
  function turnDegrees(now) {
    if (!turning) return turns * 120 + preview;
    const t = Math.min(1, (now - turning.start) / TURN_MS), eased = t * t * (3 - 2 * t);
    return 120 * (turning.from + (turning.to - turning.from) * eased);
  }
  // The solve faces the direction its step uses, turning there with motion.
  function showBeat(next) {
    const target = next ? steps[next - 1].turn : 0, from = turnDegrees(performance.now()) / 120;
    beat = next; turns = target;
    turning = motionEnabled && Math.abs(target - from) > 1e-6 ? { from, to: target, start: performance.now() } : null;
  }
  // A player's turn takes over from autoplay; 0 settles a short drag back.
  function turnBy(delta, auto = false) {
    if (turning) return;
    const now = performance.now(), from = turns + preview / 120;
    turns += delta; preview = 0; wheelAmount = 0; wheelLast = -Infinity;
    if (!auto) paused = true;
    if (motionEnabled && Math.abs(turns - from) > 1e-6) turning = { from, to: turns, start: now };
    else restSince = now;
    draw(); schedule();
  }
  // Screen words for reading a strip inward from its hint.
  function direction(clue, angle) {
    const [x, y] = TriBoardGeometry.rotatePoint(clue.outward, angle).map(v => -v);
    return TriCopy.t(`intro.${y < 0 ? 'up' : 'down'}-${x < 0 ? 'left' : 'right'}`);
  }
  function draw() {
    const geometry = window.TriBoardGeometry;
    const theme = currentTheme();
    writeTheme(root, theme);
    root.dataset.paused = String(paused);
    const focusedRow = document.activeElement?.closest?.('#intro-board [data-demo-row]')?.dataset.demoRow;
    board.replaceChildren();
    board.tabIndex = page >= 2 ? 0 : -1;
    // Hints are always the game's columns; desktop turns them into rows.
    const desktop = window.innerWidth >= 900, columns = true, turned = desktop;
    const stripAngle = pose => turned ? pose - 90 : pose;
    // The game's resting poses: desktop base-up, phone base-left. The lesson
    // rows are the two directions shown on the phone's third pose.
    const base = desktop ? 0 : 270;
    const angle = base + (page >= 2 ? turnDegrees(performance.now()) : 0);
    const moving = page >= 2 && (!!turning || preview !== 0);
    const font = columns ? 16 : 24, numeralFont = columns ? font * geometry.columnNumeral : font;
    const spread = geometry.columnSpreads[0];
    const toScreen = p => geometry.rotatePoint(p, angle).map(v => v * SCALE);
    const bounds = [];
    const include = ([x,y], min = [0,0], max = [0,0]) => bounds.push([x+min[0], y+min[1]], [x+max[0], y+max[1]]);
    const title = svg('title', { id: 'intro-board-title' }); title.textContent = TriCopy.t('intro.diagram');
    const step = page === 2 && beat ? steps[beat - 1] : null;
    const active = page === 1 ? rows[beat] : step?.fill ? strips[step.axis][step.r] : null;
    const shown = page === 0 ? cells.map(c => c.filled ? 1 : 0) : step?.marks || Array(25).fill(0);
    cells.forEach((c, id) => {
      const points = geometry.corners(c, N).map(toScreen);
      points.forEach(p => include(p, [-2,-2], [2,2]));
      const lit = active?.ids.includes(id);
      svg('polygon', { points: points.map(p => p.join(',')).join(' '), class: `intro-cell ${shown[id] === 1 ? 'filled' : ''} ${lit ? 'emphasis' : ''}`, 'data-demo-cell': id, 'data-mark': shown[id] });
      if (shown[id] === 2) {
        const [x,y] = geometry.mean(points);
        svg('path', { d: `M${x-6},${y-6}l12,12m0,-12l-12,12`, class: 'intro-cross' });
      }
    });
    // Numerals and rails for one pose, in the game's px-beyond-the-board units.
    const layoutAt = pose => {
      const clues = geometry.clueRows(stripAngle(pose), false, demo);
      const marks = columns ? geometry.columnBands(clues, pose, font, numeralFont, spread, N, turned).constraints
        : clues.flatMap(clue => geometry.diagonalNumerals(clue, pose, desktop, font));
      return { clues, marks };
    };
    const place = m => [m.p[0] * SCALE + m.extra[0], m.p[1] * SCALE + m.extra[1]];
    // A hint's halo encloses all of its numerals.
    const haloOf = (clue, marks) => {
      const own = marks.filter(m => m.value !== undefined && m.axis === clue.axis && m.row === clue.row);
      const box = [[Infinity,Infinity],[-Infinity,-Infinity]];
      for (const m of own) { const at = place(m); for (const a of [0,1]) { box[0][a] = Math.min(box[0][a], at[a]+m.min[a]); box[1][a] = Math.max(box[1][a], at[a]+m.max[a]); } }
      const [cx,cy] = [0,1].map(a => (box[0][a] + box[1][a]) / 2);
      const [rx,ry] = [0,1].map(a => Math.max(23, (box[1][a] - box[0][a]) / 2 + 8));
      return { own, cx, cy, rx, ry };
    };
    const rowIndex = clue => clue.axis < 2 ? clue.row * 2 + clue.axis : -1;
    const isActive = clue => !!active && clue.axis === active.axis && clue.row === active.r;
    // Reserve every resting pose on the turning pages and every halo on the
    // lesson pages, so turning or row emphasis never changes the scale.
    const poses = page >= 2 ? [0,120,240].map(t => base + turns * 120 + t) : page ? [angle] : [];
    for (const pose of poses) {
      const { clues, marks } = layoutAt(pose);
      for (const m of marks) include(place(m), m.min, m.max);
      if (page < 3) for (const clue of clues) { const { cx,cy,rx,ry } = haloOf(clue, marks); include([cx,cy], [-rx-3,-ry-3], [rx+3,ry+3]); }
    }
    if (page > 0 && !moving) {
      const { clues, marks } = layoutAt(angle);
      for (const clue of clues) {
        const { own, cx, cy, rx, ry } = haloOf(clue, marks);
        const index = rowIndex(clue);
        const group = svg('g', { 'data-axis': clue.axis, 'data-row': clue.row, class: isActive(clue) ? 'intro-hint active' : 'intro-hint' });
        if (index >= 0) group.dataset.demoRow = index;
        if (page === 1) {
          group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
          group.setAttribute('aria-pressed', String(isActive(clue)));
          group.setAttribute('aria-label', TriCopy.t('intro.hint', { runs: clue.runs.join(' '), row: clue.row + 1 }));
        }
        svg('ellipse', { cx,cy,rx:rx+6,ry:ry+6,class:'intro-hit' },group);
        svg('ellipse', { cx,cy,rx,ry,class:'intro-halo' },group);
        if (!columns) for (const m of own) {
          const [x,y] = place(m);
          const text = svg('text', { x,y,'text-anchor':m.anchor,'dominant-baseline':m.baseline,'font-size':font,class:'intro-numeral' },group);
          text.textContent = m.value;
        }
      }
      if (columns) geometry.drawColumns(board, { clues, angle, font, spread, turned, center: [0,0], scale: SCALE, toScreen }, theme.cell, {
        n: N, idPrefix: 'intro-clue-line', restingDim: () => false,
        numeral: item => ({ class: `intro-numeral${isActive(item) ? ' active' : ''}`, ...(rowIndex(item) >= 0 ? { 'data-demo-row': rowIndex(item) } : {}) }),
      });
    }
    const minX = Math.floor(Math.min(...bounds.map(p => p[0]))-8), minY = Math.floor(Math.min(...bounds.map(p => p[1]))-8);
    const maxX = Math.ceil(Math.max(...bounds.map(p => p[0]))+8), maxY = Math.ceil(Math.max(...bounds.map(p => p[1]))+8);
    board.setAttribute('viewBox', `${minX} ${minY} ${maxX-minX} ${maxY-minY}`);
    if (focusedRow !== undefined) board.querySelector(`g[data-demo-row="${focusedRow}"]`)?.focus({ preventScroll: true });
    const activeClue = active && geometry.clueRows(stripAngle(angle), false, demo).find(isActive);
    el('intro-step-text').textContent = page === 1 ? TriCopy.t('intro.row', { row: active.r + 1, direction: direction(activeClue, angle) }) :
      page === 3 ? TriCopy.t('intro.rotation') : page === 2 ? stepText(step) : '';
    // The one extra control beside Home: pause while something plays, replay a finished solve.
    const pause = el('intro-pause');
    pause.hidden = page === 0 || (!motionEnabled && !solved());
    pause.textContent = TriCopy.t(solved() ? 'intro.replay' : paused ? 'intro.play' : 'intro.pause');
  }
  function stepText(step) {
    if (!step) return TriCopy.t('intro.blank');
    if (!step.fill) return TriCopy.t('intro.turn');
    const line = strips[step.axis][step.r];
    const count = step.reason === 'cross' ? line.runs.reduce((a,b) => a+b, 0) : line.ids.length;
    return TriCopy.t(`intro.${step.reason}`, { runs: runsText(line), count });
  }
  function showPage() {
    stop();
    beat = 0; paused = false; turns = 0; turning = null; preview = 0; gesture = null; restSince = performance.now();
    root.dataset.page = page;
    el('intro-progress').textContent = TriCopy.t('intro.progress', { current:page+1 });
    el('intro-title').textContent = TriCopy.t(`intro.${page}.title`);
    if (page === 0) {
      el('intro-description').innerHTML = TriCopy.html('intro.0.body', { nonogram: '__NONOGRAM_LINK__' }).replace('__NONOGRAM_LINK__',
        `<a id="intro-nonogram" href="https://en.wikipedia.org/wiki/Nonogram" target="_blank" rel="noopener noreferrer">${TriCopy.html('intro.nonogram')}</a>`);
    } else el('intro-description').textContent = TriCopy.t(`intro.${page}.body`);
    el('intro-controls').hidden = page === 0;
    el('intro-next').textContent = TriCopy.t(page === 3 ? (returnToPuzzle ? 'intro.backToPuzzle' : 'intro.start') : 'intro.next');
    el('intro-exit').textContent = TriCopy.t(returnToPuzzle ? 'intro.close' : 'intro.exit');
    draw(); schedule(); el('intro-title').focus();
  }
  function selectRow(index) { beat = index; paused = true; draw(); schedule(); }
  // Tapping the solve steps it by hand; tapping the finished board replays it.
  function stepSolve() {
    if (solved()) { showBeat(0); paused = false; }
    else { showBeat(beat + 1); paused = true; }
    draw(); schedule();
  }
  window.triCloseIntro = () => { stop(); root.hidden = true; };
  window.triStartIntro = (options) => {
    if (!appReady) return toast(TriCopy.t('errors.loading'));
    window.triShowHome();
    returnToPuzzle = options?.returnToPuzzle === true;
    el('home').hidden = true; window.triHomeChanged?.();
    root.hidden = false; page = 0; showPage(); window.triSyncHistory?.();
  };
  el('how-to-play').onclick = window.triStartIntro;
  el('replay').onclick = window.triStartIntro;
  el('intro-next').onclick = () => {
    if (page < 3) { page++; showPage(); }
    else if (returnToPuzzle) leaveIntro();
    else { window.triCloseIntro(); call('replay'); window.triShowPlay(); }
  };
  el('intro-back').onclick = () => { if (page) { page--; showPage(); } else leaveIntro(); };
  el('intro-exit').onclick = () => leaveIntro();
  el('intro-pause').onclick = () => {
    if (solved()) { showBeat(0); paused = false; }
    else { paused = !paused; restSince = performance.now(); }
    draw(); schedule();
  };
  board.addEventListener('click', e => {
    if (page === 1) { const hint = e.target.closest?.('[data-demo-row]'); if (hint) selectRow(+hint.dataset.demoRow); }
    else if (page === 2) stepSolve();
  });
  board.addEventListener('keydown', e => {
    const press = e.key === 'Enter' || e.key === ' ';
    if (page === 1 && press) {
      const hint = e.target.closest?.('[data-demo-row]');
      if (hint) { e.preventDefault(); selectRow(+hint.dataset.demoRow); }
    } else if (page === 2 && press && e.target === board) { e.preventDefault(); stepSolve(); }
    else if (page === 3 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); turnBy(e.key === 'ArrowRight' ? 1 : -1); }
  });
  // Turning by hand follows the game: scroll, or drag like a wheel on a phone.
  board.addEventListener('wheel', e => {
    if (page !== 3) return;
    e.preventDefault();
    const now = performance.now();
    if (turning || now - restSince < TURN_MS) { wheelAmount = 0; wheelLast = -Infinity; return; }
    if (now - wheelLast > 180) wheelAmount = 0;
    wheelLast = now;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAmount += delta * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(wheelAmount) >= 45) turnBy(Math.sign(wheelAmount));
  }, { passive: false });
  // [horizontal, vertical] drag signs about the pivot, as in the game.
  function wheelSigns(e) {
    if (window.innerWidth >= 900) return [1, 1];
    const rect = board.getBoundingClientRect(), [x,y,w,h] = board.getAttribute('viewBox').split(' ').map(Number);
    const s = Math.min(rect.width / w, rect.height / h) || 1;
    const pivot = [rect.left + (rect.width - w * s) / 2 - x * s, rect.top + (rect.height - h * s) / 2 - y * s];
    return [e.clientY > pivot[1] ? -1 : 1, e.clientX < pivot[0] ? -1 : 1];
  }
  board.addEventListener('pointerdown', e => {
    if (page !== 3 || turning || gesture || e.button !== 0) return;
    e.preventDefault();
    board.setPointerCapture?.(e.pointerId);
    gesture = { id: e.pointerId, start: [e.clientX, e.clientY], signs: wheelSigns(e), moved: false, delta: 0 };
  });
  board.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.start[0], dy = e.clientY - gesture.start[1];
    if (Math.hypot(dx, dy) > 8) gesture.moved = true;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    gesture.delta = (horizontal ? dx : dy) * gesture.signs[horizontal ? 0 : 1] * (window.innerWidth < 900 ? .5 : 1);
    if (gesture.moved) { preview = Math.max(-120, Math.min(120, gesture.delta)); draw(); }
  });
  function release(e, cancelled = false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const done = gesture; gesture = null;
    if (!cancelled && done.moved && Math.abs(done.delta) >= 45) turnBy(Math.sign(done.delta));
    else if (preview) turnBy(0);
  }
  board.addEventListener('pointerup', e => release(e));
  board.addEventListener('pointercancel', e => release(e, true));
  document.addEventListener('visibilitychange', () => { restSince = performance.now(); schedule(); });
  window.addEventListener('resize', () => { if (!root.hidden) draw(); });
  motionPreference?.addEventListener('change', () => { if (!root.hidden) { draw(); schedule(); } });
  themePreference?.addEventListener('change', () => { if (!root.hidden) draw(); });
})();
