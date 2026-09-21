"use strict";
// An isolated demonstration: never writes marks or rotations into the game engine.
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const root = el('tutorial-intro'), board = el('intro-board');
  const cells = [];
  const centroidY = 160 * Math.sqrt(3);
  const vertex = (i, j) => [(j - i) * 48, (i + j) * 48 * Math.sqrt(3)];
  for (let row = 0; row < 5; row++) for (let k = 0; k <= 2 * row; k++) {
    const i = Math.floor(k / 2), o = k % 2, j = row - i - o;
    const points = (o ? [[i + 1,j],[i,j + 1],[i + 1,j + 1]] : [[i,j],[i,j + 1],[i + 1,j]]).map(([a,b]) => vertex(a,b));
    cells.push({ i,j,o,points, filled: i === 0 || j === 0 });
  }
  const rows = [];
  for (let r = 0; r < 5; r++) for (let axis = 0; axis < 2; axis++) {
    const ids = cells.map((c,id) => id).filter(id => cells[id][axis ? 'j' : 'i'] === r)
      .sort((a,b) => (2 * cells[a][axis ? 'i' : 'j'] + cells[a].o) - (2 * cells[b][axis ? 'i' : 'j'] + cells[b].o));
    const runs = []; let run = 0;
    for (const id of ids) { if (cells[id].filled) run++; else if (run) { runs.push(run); run = 0; } }
    if (run) runs.push(run);
    rows.push({ ids, runs: runs.length ? runs : [0], axis, r });
  }
  // First fill the two full rows; then cross the unknown cells in completed rows.
  const marks = Array(25).fill(0), steps = [];
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    const full = line.runs.length === 1 && line.runs[0] === line.ids.length;
    const complete = line.ids.filter(id => marks[id] === 1).length === line.runs.reduce((a,b) => a+b,0);
    if (!full && !complete) continue;
    const changed = line.ids.filter(id => !marks[id]);
    if (!changed.length) continue;
    changed.forEach(id => { marks[id] = full ? 1 : 2; });
    steps.push({ row, changed, value: full ? 1 : 2, marks: marks.slice() });
  }
  const rotationRows = rows.slice();
  for (let r = 0; r < 5; r++) {
    const ids = cells.map((c,id) => id).filter(id => cells[id].i + cells[id].j + cells[id].o === 4-r);
    const runs = []; let run = 0;
    for (const id of ids) { if (cells[id].filled) run++; else if (run) { runs.push(run); run=0; } }
    if (run) runs.push(run);
    rotationRows.push({ ids, runs: runs.length ? runs : [0], axis:2,r });
  }
  window.TriIntroDemo = { cells, rows, steps };
  let page = 0, beat = 0, timer = 0, paused = false, frame = 0, angle = 0, lastTime = null, rotationElapsed = 0;
  function svg(tag, attrs, parent = board) {
    const node = document.createElementNS(ns, tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node); return node;
  }
  function stop() { clearTimeout(timer); timer = 0; cancelAnimationFrame(frame); frame = 0; lastTime = null; }
  // Match the game's 420 ms smoothstep turn, with time to read between turns.
  const TURN_MS = 420, REST_MS = 1800;
  function animate(time) {
    if (lastTime !== null) rotationElapsed += time - lastTime;
    lastTime = time;
    const cycle = REST_MS + TURN_MS;
    const turns = Math.floor(rotationElapsed / cycle);
    const progress = Math.max(0, (rotationElapsed % cycle - REST_MS) / TURN_MS);
    angle = 120 * (turns + progress * progress * (3 - 2 * progress));
    draw(); frame = requestAnimationFrame(animate);
  }
  function schedule() {
    stop();
    if (root.hidden || page === 0 || paused || !motionEnabled || document.hidden || (page === 2 && beat === steps.length)) return;
    if (page === 3) { frame = requestAnimationFrame(animate); return; }
    timer = setTimeout(() => { beat = page === 1 ? (beat + 1) % rows.length : beat + 1; draw(); schedule(); }, page === 1 ? 1800 : 2400);
  }
  function rotationHint(line, radians, desktop) {
    const directions = [[.5, Math.sqrt(3)/2], [-.5, Math.sqrt(3)/2], [-1, 0]];
    const rotated = directions.map(([x,y]) => [x*Math.cos(radians)-y*Math.sin(radians), x*Math.sin(radians)+y*Math.cos(radians)]);
    const edgeAxis = desktop ? 1 : 0;
    const hiddenAxis = rotated.reduce((best,d,axis) => Math.abs(d[edgeAxis]) < Math.abs(rotated[best][edgeAxis]) ? axis : best, 0);
    if (line.axis === hiddenAxis) return null;
    const atEnd = rotated[line.axis][edgeAxis] > 0;
    const endpoint = cells[line.ids[atEnd ? line.ids.length - 1 : 0]];
    const center = [0,1].map(a => endpoint.points.reduce((sum,p) => sum+p[a],0)/3);
    const outward = directions[line.axis].map(v => v * (atEnd ? 1 : -1));
    const normals = [[0,1], [Math.sqrt(3)/2,-.5], [-Math.sqrt(3)/2,-.5]];
    const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
    const distance = Math.min(...normals.filter(n => dot(outward,n) > 1e-6)
      .map(n => (80*Math.sqrt(3)-dot([center[0],center[1]-160*Math.sqrt(3)],n))/dot(outward,n)));
    const position = center.map((v,a) => v + (distance+32)*outward[a]);
    return { position: [position[0]*Math.cos(radians)-(position[1]-centroidY)*Math.sin(radians), centroidY+position[0]*Math.sin(radians)+(position[1]-centroidY)*Math.cos(radians)], runs: atEnd ? [...line.runs].reverse() : line.runs };
  }
  function draw() {
    writeTheme(root, currentTheme());
    root.dataset.paused = String(paused);
    board.replaceChildren();
    const desktop = window.innerWidth >= 900;
    const bounds = [];
    const include = (x,y,pad=0) => bounds.push([x-pad,y-pad], [x+pad,y+pad]);
    const radians = ((desktop ? 180 : 90) + angle) * Math.PI/180;
    const turn = ([x,y]) => [x*Math.cos(radians)-(y-centroidY)*Math.sin(radians), centroidY+x*Math.sin(radians)+(y-centroidY)*Math.cos(radians)];
    const title = svg('title', { id: 'intro-board-title' }); title.textContent = TriCopy.t('intro.diagram');
    const step = page === 2 && beat ? steps[beat - 1] : null;
    const active = page === 1 ? beat : step?.row;
    const shown = page === 0 ? cells.map(c => c.filled ? 1 : 0) : step?.marks || Array(25).fill(0);
    for (let id = 0; id < cells.length; id++) {
      const c = cells[id], lit = active !== undefined && rows[active].ids.includes(id);
      const points = c.points.map(turn);
      points.forEach(([x,y]) => include(x,y,2));
      svg('polygon', { points: points.map(p => p.join(',')).join(' '), class: `intro-cell ${shown[id] === 1 ? 'filled' : ''} ${lit ? 'emphasis' : ''}`, 'data-demo-cell': id, 'data-mark': shown[id] });
      if (shown[id] === 2) {
        const [x,y] = turn([c.points.reduce((n,p) => n+p[0],0)/3, c.points.reduce((n,p) => n+p[1],0)/3]);
        svg('path', { d: `M${x-6},${y-6}l12,12m0,-12l-12,12`, class: 'intro-cross' });
      }
    }
    // Like the playable board, suppress clues during a turn, then select the
    // two directions that are not parallel to the bare top/left edge.
    const turning = page === 3 && Math.abs(angle / 120 - Math.round(angle / 120)) > 1e-6;
    if (page > 0 && !turning) (page === 3 ? rotationRows : rows).forEach((line,index) => {
      const hint = page === 3 ? rotationHint(line, radians, desktop) : null;
      if (page === 3 && !hint) return;
      const [x,y] = vertex(line.axis ? 0 : line.r, line.axis ? line.r : 0);
      // Each clue sits outside the start of its diagonal, in reading order.
      const side = line.axis ? 1 : -1;
      let position = [x + side * 48,y - 25];
      let runs = line.runs;
      if (hint) runs = hint.runs;
      const [cx,cy] = hint ? hint.position : turn(position);
      const group = svg('g', { 'data-demo-row': index, 'data-axis':line.axis, class: index === active ? 'intro-hint active' : 'intro-hint' });
      svg('ellipse', { cx,cy,rx:23,ry:23,class:'intro-halo' },group);
      const text = svg('text', { x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central' },group); text.textContent = runs.join(' ');
      // Reserve every halo, not just the active one, so row emphasis never
      // changes the scale. Include measured text for multi-number clues.
      const halfWidth = Math.max(26, (text.getComputedTextLength?.() || runs.join(' ').length*15)/2 + 3);
      bounds.push([cx-halfWidth,cy-26], [cx+halfWidth,cy+26]);
    });
    if (page === 3) {
      // Fit the actual resting clues, not a circle padded for hypothetical
      // rotating clues. Only triangle corners need extra space during a turn.
      for (const pose of [0,120,240]) for (const line of rotationRows) {
        const hint = rotationHint(line, ((desktop ? 180 : 90)+pose)*Math.PI/180, desktop);
        if (!hint) continue;
        const [x,y] = hint.position;
        const halfWidth = Math.max(26, hint.runs.join(' ').length*15/2+3);
        bounds.push([x-halfWidth,y-26], [x+halfWidth,y+26]);
      }
    }
    const minX = Math.floor(Math.min(...bounds.map(p => p[0]))-8), minY = Math.floor(Math.min(...bounds.map(p => p[1]))-8);
    const maxX = Math.ceil(Math.max(...bounds.map(p => p[0]))+8), maxY = Math.ceil(Math.max(...bounds.map(p => p[1]))+8);
    board.setAttribute('viewBox', `${minX} ${minY} ${maxX-minX} ${maxY-minY}`);
    el('intro-step-text').textContent = page === 1 ? TriCopy.t('intro.row', { row: rows[beat].r + 1, direction: TriCopy.t(desktop ? (rows[beat].axis ? 'intro.up-right' : 'intro.up-left') : (rows[beat].axis ? 'intro.up-left' : 'intro.down-left')) }) :
      page === 3 ? TriCopy.t('intro.rotation') : page === 2 ? (step ? TriCopy.t(step.value === 1 ? 'intro.fill' : 'intro.cross', { count: rows[step.row].runs[0] }) : TriCopy.t('intro.blank')) : '';
    el('intro-step').textContent = TriCopy.t(page === 3 ? 'intro.rotate' : page === 2 && beat === steps.length ? 'intro.replay' : 'intro.step');
    el('intro-pause').textContent = TriCopy.t(paused ? 'intro.play' : 'intro.pause');
    el('intro-pause').hidden = !motionEnabled || page === 0;
  }
  function showPage() {
    beat = 0; angle = 0; rotationElapsed = 0; paused = false;
    root.dataset.page = page;
    el('intro-progress').textContent = TriCopy.t('intro.progress', { current:page+1 });
    el('intro-title').textContent = TriCopy.t(`intro.${page}.title`);
    if (page === 0) {
      el('intro-description').innerHTML = TriCopy.html('intro.0.body', { nonogram: '__NONOGRAM_LINK__' }).replace('__NONOGRAM_LINK__',
        `<a id="intro-nonogram" href="https://en.wikipedia.org/wiki/Nonogram" target="_blank" rel="noopener noreferrer">${TriCopy.html('intro.nonogram')}</a>`);
    } else el('intro-description').textContent = TriCopy.t(`intro.${page}.body`);
    el('intro-controls').hidden = page === 0;
    el('intro-next').textContent = TriCopy.t(page === 3 ? 'intro.start' : 'intro.next');
    draw(); schedule(); el('intro-title').focus();
  }
  window.triCloseIntro = () => { stop(); root.hidden = true; };
  window.triStartIntro = () => {
    if (!appReady) return toast(TriCopy.t('errors.loading'));
    window.triShowHome();
    el('home').hidden = true; window.triHomeChanged?.();
    root.hidden = false; page = 0; showPage(); window.triSyncHistory?.();
  };
  el('how-to-play').onclick = window.triStartIntro;
  el('replay').onclick = window.triStartIntro;
  el('intro-next').onclick = () => {
    if (page < 3) { page++; showPage(); }
    else { window.triCloseIntro(); call('replay'); window.triShowPlay(); }
  };
  el('intro-back').onclick = () => { if (page) { page--; showPage(); } else window.triShowHome(); };
  el('intro-exit').onclick = () => window.triShowHome();
  el('intro-step').onclick = () => { paused = true; if (page === 3) { angle = (Math.floor(angle / 120) + 1) * 120; rotationElapsed = angle / 120 * (REST_MS + TURN_MS); } beat = page === 1 ? (beat+1)%rows.length : (beat+1)%(steps.length+1); draw(); schedule(); };
  el('intro-pause').onclick = () => { paused = !paused; draw(); schedule(); };
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('resize', () => { if (!root.hidden) draw(); });
  motionPreference?.addEventListener('change', () => { if (!root.hidden) { draw(); schedule(); } });
  themePreference?.addEventListener('change', () => { if (!root.hidden) draw(); });
})();
