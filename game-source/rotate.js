"use strict";
// SVG view over the shared C rules engine. Puzzle coordinates never turn.
// Only this session's view, gestures and counters know about rotation.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const SQRT3 = Math.sqrt(3);
  const EDGE = 24;
  // Portrait and other phone layouts can spend the side gutter on the triangle.
  const MOBILE_EDGE = 8;
  // Column-boundary numerals draw half again as large as the pitch they sit on.
  const COLUMN_NUMERAL = 1.5;
  // A solved row flashes from the outside numeral inward, then rests at half opacity.
  const NUMERAL_STEP = 180;
  const NUMERAL_PULSE = 240;
  const screenEdge = desktop => desktop ? EDGE : MOBILE_EDGE;
  const TURN_MS = 420;
  const svg = document.createElementNS(NS, "svg");
  svg.id = "rotate-board";
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", TriCopy.t("rotation.boardLabel"));
  stage.append(svg);
  // Programmatic focus after a tap can retain :focus-visible in some browsers.
  // Track the input method explicitly so only keyboard use outlines the board.
  document.addEventListener("pointerdown", () => { svg.dataset.keyboardFocus = "false"; }, true);
  document.addEventListener("keydown", e => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !["Shift", "Control", "Alt", "Meta"].includes(e.key))
      svg.dataset.keyboardFocus = "true";
  }, true);
  const bar = document.createElement("div");
  bar.id = "session-bar";
  bar.innerHTML = `<span>${TriCopy.html("app.name")}</span><span id="session-details"><button id="session-seed" type="button" hidden></button><span id="session-clock">${TriCopy.html("rotation.clock", { time: "00:00", count: 0 })}</span>`;
  el("app").append(bar);
  const controls = document.createElement("div");
  controls.id = "turn-controls";
  for (const [id, label] of [["turn-left", TriCopy.t("rotate.rotate-counterclockwise")], ["turn-right", TriCopy.t("rotate.rotate-clockwise")]]) {
    const button = document.createElement("button");
    button.id = id; button.className = "icon";
    button.setAttribute("aria-label", label); button.title = label;
    button.append(el("undo").querySelector("svg").cloneNode(true));
    controls.append(button);
  }
  el("bottom-controls").insertBefore(controls, el("undo"));
  el("bottom-controls").prepend(el("completion"));
  const copyPanel = document.createElement("div");
  copyPanel.id = "result-copy";
  copyPanel.hidden = true;
  copyPanel.innerHTML = `<label for="result-text">${TriCopy.html("rotate.copy-your-result-and-puzzle-link")}</label><textarea id="result-text" readonly></textarea><button id="result-close">${TriCopy.html("rotate.close")}</button>`;
  document.body.append(copyPanel);
  el("result-close").onclick = () => { copyPanel.hidden = true; el("share-result").focus(); };

  let view = 0, visualTurn = 0, preview = 0, animation = null, key = "", restart = false;
  // A crafted puzzle faces its author's chosen way: it opens there and the
  // victory spin always lands there. reveal holds the extra turn that spin adds.
  let reveal = null;
  const homeView = () => state?.custom ? currentPuzzle?.orientation || 0 : 0;
  let elapsed = 0, turns = 0, lastTick = performance.now(), running = false;
  let finished = null, previousWon = false, geometry = null;
  let shareHelpSettled = false;
  // axis:row -> { start, count }. start < 0 means the row was already solved, so it stays dim.
  const solvedRows = new Map();
  function syncSolvedRows(next, flashNew) {
    if (!next?.clues || next.editing) { solvedRows.clear(); return; }
    // A finished board hides its clues, so keep the pre-win flashes for undo.
    if (next.won) return;
    const now = performance.now();
    const live = new Set();
    for (let axis = 0; axis < 3; axis++) for (let row = 0; row < next.n; row++) {
      const clue = next.clues[axis][row];
      if (!clue.match) continue;
      const id = `${axis}:${row}`;
      live.add(id);
      if (!solvedRows.has(id)) {
        const count = Math.max(1, clue.runs.length);
        solvedRows.set(id, { start: flashNew && motionEnabled ? now : -1, count });
      }
    }
    for (const id of solvedRows.keys()) if (!live.has(id)) solvedRows.delete(id);
  }
  function clueFlashPending() {
    if (!motionEnabled) return false;
    const now = performance.now();
    for (const entry of solvedRows.values()) {
      if (entry.start < 0) continue;
      if (now - entry.start < (entry.count - 1) * NUMERAL_STEP + NUMERAL_PULSE) return true;
    }
    return false;
  }
  function numeralFill(cellColor, stage, glow) {
    if (!(glow > 0)) return "var(--cell)";
    // A colorful numeral is already near white, so the cell-sized white mix never shows.
    if (themeMode === "colorful") return TriPalette.mix(cellColor, "#ffffff", Math.min(1, glow * 3));
    return TriPalette.flash(cellColor, stage, glow, themeMode);
  }
  // glow*3 is how a full numeral reaches the flash color. Smoothstep keeps the
  // ends flat so a dim glyph eases out of its half-opacity composite and back.
  function flashEase(glow) {
    const x = Math.min(1, Math.max(0, glow * 3));
    return x * x * (3 - 2 * x);
  }
  function dimFlashPaint(cellColor, stage, glow, mode = themeMode) {
    const t = flashEase(glow);
    const bg = document.documentElement.style.getPropertyValue("--bg").trim() || "#000000";
    const rest = TriPalette.mix(bg, cellColor, .5);
    const peak = mode === "colorful" ? "#ffffff" : TriPalette.rainbow[((stage % 7) + 7) % 7];
    return { fill: TriPalette.mix(rest, peak, t), opacity: 1, amount: t };
  }
  function numeralAttrs(axis, row, run, count, cellColor, endpoint) {
    // Both layouts place run 0 nearest the board and the last run on the outside.
    // A fill ripple keeps going outward: the nearest numeral is the next hop.
    const order = count - 1 - run;
    const entry = solvedRows.get(`${axis}:${row}`);
    let opacity = 1, glow = 0, stage = order, dimmed = false, settle = false;
    if (entry) {
      dimmed = true;
      opacity = .5;
      if (motionEnabled && entry.start >= 0) {
        const age = performance.now() - entry.start - order * NUMERAL_STEP;
        if (age < NUMERAL_PULSE) {
          if (age <= 0) {
            // Waiting numerals stay readable until their own pulse.
            dimmed = false;
            opacity = 1;
          } else {
            const wave = Math.sin(age / NUMERAL_PULSE * Math.PI);
            glow = wave * wave;
            if (age <= NUMERAL_PULSE / 2) {
              dimmed = false;
              opacity = 1;
            } else settle = true;
          }
        }
      }
    }
    if (motionEnabled && endpoint >= 0) {
      const echo = Number(call("echo_light", endpoint, run + 1)) || 0;
      if (echo > glow) {
        glow = echo;
        stage = Number(call("echo_stage", endpoint, run + 1)) || 0;
        if (!dimmed && !settle) opacity = 1;
      }
    }
    // Resting dim, an echo on it, and the falling half of a match pulse all
    // paint the composited color. A step in opacity reads as a jump to white.
    const tween = (dimmed || settle) && glow > 0;
    const painted = tween ? dimFlashPaint(cellColor, stage, glow) : { fill: numeralFill(cellColor, stage, glow), opacity, amount: 0 };
    return {
      fill: painted.fill,
      // The stylesheet also sets this fill; the inline value is what the pulse paints.
      style: `fill:${painted.fill}`,
      opacity: painted.opacity,
      "data-glow": glow,
      "data-flash-stage": stage,
      "data-flash-order": order,
      "data-flash-amount": painted.amount,
      "data-endpoint": endpoint,
    };
  }
  let attemptKey = "", lastSaved = -Infinity;
  let attempts = {};
  try { attempts = JSON.parse(localStorage.getItem("tri-rotate-attempts-v1")) || {}; } catch {}
  function saveAttempt(force = false) {
    if (!attemptKey || (!force && performance.now() - lastSaved < 1000)) return;
    attempts[attemptKey] = { elapsed, turns, view, finished };
    try { localStorage.setItem("tri-rotate-attempts-v1", JSON.stringify(attempts)); } catch {}
    if (attemptKey.startsWith("endless/")) {
      window.triSaveEndlessProgress?.(attemptKey.slice("endless/".length), {
        elapsed, turns, view, finished,
        marks: state?.cells?.map(cell => cell.state).join(""),
      });
    }
    lastSaved = performance.now();
  }
  let wheelAmount = 0, wheelLast = -Infinity, wheelCooldownUntil = -Infinity;
  const pointers = new Map();
  let gesture = null;
  function formatTime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  el("session-seed").onclick = async () => {
    const code = TriShare.seedCode(currentPuzzle?.seed, currentPuzzle?.difficulty);
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast(TriCopy.t("share.codeCopied")); }
    catch { window.triOpenPuzzleLoader(code); el("puzzle-code").select(); toast(TriCopy.t("share.copyCodeFallback")); }
  };
  function mayPlay() {
    return appReady && state && !window.triMenuOpen && !el("app").inert && el("puzzle-menu").hidden && !document.hidden;
  }
  function clock() {
    const now = performance.now();
    if (running) elapsed += Math.max(0, now - lastTick);
    lastTick = now;
    running = !!(mayPlay() && !state.won && !state.editing);
    el("session-clock").textContent = TriCopy.t("rotation.clock", { time: formatTime(finished?.elapsed ?? elapsed), count: finished?.turns ?? turns });
    if (state?.editing) el("session-clock").textContent = TriCopy.t("rotate.editing");
    const seed = state?.custom && !state.editing ? currentPuzzle?.seed : undefined;
    const seedCode = TriShare.seedCode(seed, currentPuzzle?.difficulty);
    el("session-seed").hidden = !seedCode;
    el("session-seed").textContent = seedCode ? TriCopy.t("rotation.seed", { seed: seedCode }) : "";
    el("session-seed").title = seedCode ? TriCopy.t("rotation.seedDetails", {
      difficulty: endlessDifficulties[currentPuzzle.difficulty], hex: seed.toString(16).toUpperCase().padStart(8, "0"), decimal: seed,
    }) : "";
    saveAttempt();
  }
  const baseCall = call;
  call = function (name, ...args) {
    if (["new", "replay", "reset"].includes(name)) restart = true;
    if (["new", "replay"].includes(name)) { attempts = {}; attemptKey = ""; }
    return baseCall(name, ...args);
  };
  const baseMenu = toggleMenu;
  toggleMenu = function (open) { clock(); baseMenu(open); clock(); };
  const baseHome = window.triShowHome;
  window.triShowHome = function (...args) {
    clock(); saveAttempt(true); cancelGesture(); baseHome(...args); applyPalette(); clock();
    copyPanel.hidden = true;
  };
  const basePlay = window.triShowPlay;
  window.triShowPlay = function (...args) { basePlay(...args); clock(); };
  const timer = setInterval(clock, 250);
  window.addEventListener("pagehide", () => { clock(); saveAttempt(true); clearInterval(timer); });
  document.addEventListener("visibilitychange", () => { clock(); saveAttempt(true); cancelGesture(); });
  window.addEventListener("blur", cancelGesture);

  window.triRotateState = (next, previous) => {
    clock();
    const boardKey = `${next.custom}/${next.revision}/${next.level}/${next.tutorial}/${next.editing}`;
    const freshBoard = restart || key !== boardKey;
    if (freshBoard) {
      cancelGesture();
      saveAttempt(true);
      const forceFresh = restart;
      key = boardKey; restart = false; view = homeView(); visualTurn = preview = 0; animation = null; reveal = null;
      elapsed = turns = 0; finished = null; previousWon = false;
      lastTick = performance.now();
      // Built-in progress survives reload/navigation; its stopwatch must, too.
      // Custom imports and editor trials start fresh. Endless attempts resume with the address.
      const endlessCode = next.custom && window.triEndlessRun ? (window.triActiveSeedCode || "") : "";
      attemptKey = !next.custom
        ? `${next.tutorial}/${next.level}/${next.solution.join("")}`
        : endlessCode ? `endless/${endlessCode}` : "";
      const savedEndless = !forceFresh && endlessCode ? window.triReadEndlessProgress?.(endlessCode) : null;
      const saved = savedEndless
        ? { elapsed: Number(savedEndless.elapsed), turns: Number(savedEndless.turns), view: Number(savedEndless.view), finished: savedEndless.finished }
        : !forceFresh && attemptKey && attempts[attemptKey];
      if (saved && Number.isFinite(saved.elapsed) && saved.elapsed >= 0 && Number.isInteger(saved.turns) && saved.turns >= 0) {
        elapsed = saved.elapsed; turns = saved.turns;
        if (Number.isInteger(saved.view)) view = ((saved.view % 3) + 3) % 3;
        finished = saved.finished;
      }
      if (next.won && !next.editing) view = homeView();
      visualTurn = view * 120;
      if (next.won && !finished) finished = { unknown: true };
      solvedRows.clear();
      shareHelpSettled = false;
    }
    syncSolvedRows(next, !freshBoard);
    if (next.won && !next.editing && !previousWon && !finished) finished = { elapsed, turns };
    if (next.won && !next.editing && !previousWon && !freshBoard) {
      // Land on the home view. The spin is never less than a full turn: it adds
      // 120° either way when the board is off home, choosing the shorter side.
      finishAnimation(); preview = 0;
      const extra = [0, 120, -120][((homeView() - view) % 3 + 3) % 3];
      view = homeView(); visualTurn += extra;
      reveal = { extra, total: extra < 0 ? extra - 360 : extra + 360 };
    }
    if (!next.won) finished = null;
    previousWon = next.won;
    saveAttempt(true);
    controls.hidden = next.won && !next.editing;
    el("app").dataset.solved = String(next.won && !next.editing);
    el("share-result").disabled = !!finished?.unknown;
    el("solve-details").textContent = finished?.unknown
      ? TriCopy.t("rotation.previousSession")
      : TriCopy.t("rotation.resultDetails", { time: formatTime(finished?.elapsed ?? elapsed), count: finished?.turns ?? turns });
    clock();
  };

  function rotatePoint([x, y], angle) {
    const radians = angle * Math.PI / 180;
    return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
  }
  function vertex(i, j, n) { return [(j - i) / n, (2 / 3 - (i + j) / n) * SQRT3]; }
  function corners(cell, n) {
    const { i, j, o } = cell;
    return o ? [vertex(i + 1, j, n), vertex(i, j + 1, n), vertex(i + 1, j + 1, n)]
      : [vertex(i, j, n), vertex(i, j + 1, n), vertex(i + 1, j, n)];
  }
  function mean(points) { return [0, 1].map(axis => points.reduce((sum, p) => sum + p[axis], 0) / points.length); }
  function axisRow(cell, axis, n) { return axis === 0 ? cell.i : axis === 1 ? cell.j : n - 1 - cell.i - cell.j - cell.o; }
  function node(name, attrs, text) {
    const item = document.createElementNS(NS, name);
    for (const [name, value] of Object.entries(attrs)) item.setAttribute(name, String(value));
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function exitSegment(cell, n, outward) {
    const idx = cell.o
      ? [[cell.i + 1, cell.j], [cell.i, cell.j + 1], [cell.i + 1, cell.j + 1]]
      : [[cell.i, cell.j], [cell.i, cell.j + 1], [cell.i + 1, cell.j]];
    const center = mean(corners(cell, n));
    let best = null, bestDot = -Infinity;
    for (let k = 0; k < 3; k++) {
      const a = idx[k], b = idx[(k + 1) % 3];
      if (!((a[0] === 0 && b[0] === 0) || (a[1] === 0 && b[1] === 0) || (a[0] + a[1] === n && b[0] + b[1] === n))) continue;
      const edge = [vertex(a[0], a[1], n), vertex(b[0], b[1], n)];
      const mid = mean(edge);
      const score = (mid[0] - center[0]) * outward[0] + (mid[1] - center[1]) * outward[1];
      if (score > bestDot) { best = edge; bestDot = score; }
    }
    return best;
  }
  // board is { n, cells, clues } in engine form; the tutorial passes its own.
  function clueRows(angle, desktop, board = state) {
    // Start-end directions of the canonical strips, through their end-cell centroids.
    const directions = [[.5, -SQRT3 / 2], [-.5, -SQRT3 / 2], [-1, 0]];
    const rotated = directions.map(d => rotatePoint(d, angle));
    // Omit the strips parallel to the bare edge: top on desktop, left on mobile.
    const edgeAxis = desktop ? 1 : 0;
    const hidden = rotated.reduce((best, d, axis) => Math.abs(d[edgeAxis]) < Math.abs(rotated[best][edgeAxis]) ? axis : best, 0);
    const normals = [[0, -1], [SQRT3 / 2, .5], [-SQRT3 / 2, .5]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const result = [];
    for (let axis = 0; axis < 3; axis++) {
      if (axis === hidden) continue;
      const first = rotated[axis][edgeAxis] > 0;
      const outward = directions[axis].map(v => v * (first ? 1 : -1));
      for (let row = 0; row < board.n; row++) {
        const cells = board.cells.filter(c => axisRow(c, axis, board.n) === row);
        cells.sort((a, b) => (2 * (axis === 0 ? b.j : b.i) + b.o) - (2 * (axis === 0 ? a.j : a.i) + a.o));
        const endpoint = first ? cells[0] : cells[cells.length - 1];
        const active = cells.filter(c => c.active);
        const echoCell = active.length ? (first ? active[0] : active[active.length - 1]) : null;
        const echoIndex = echoCell ? board.cells.indexOf(echoCell) : -1;
        const center = mean(corners(endpoint, board.n));
        const distance = Math.min(...normals.filter(n => dot(outward, n) > 1e-6)
          .map(n => (SQRT3 / 3 - dot(center, n)) / dot(outward, n)));
        const edge = center.map((v, a) => v + distance * outward[a]);
        const runs = board.clues[axis][row].runs.length ? [...board.clues[axis][row].runs] : [0];
        if (first) runs.reverse();
        const segment = exitSegment(endpoint, board.n, outward) || [edge, edge];
        result.push({ axis, row, center, edge, outward, runs, segment, echoIndex });
      }
    }
    return result;
  }
  // Phone columns are a full rank wide, so one line is the right side of one
  // rank and the left side of the next. A 60° turn from vertical onto the rank
  // puts that line half a radius to the right of the vertex it meets.
  let columnStyle = "corner";
  try {
    const saved = localStorage.getItem("delta-triplex-clue-style");
    if (saved === "corner" || saved === "curve") columnStyle = saved;
  } catch {}
  // Center spacing is three times the previous pitch; very short screens
  // tighten it (see chooseMobileLayout). The inner numeral keeps its original
  // offset from the corner joint the rail already measures.
  const COLUMN_SPREADS = [3, 2, 1.5];
  function columnMetrics(font, spread = COLUMN_SPREADS[0]) {
    const pitch = font * 1.12;
    const gap = Math.max(4, font * .42);
    const tail = font * .55;
    const offset = i => gap + (i * spread + .5) * pitch;
    return { pitch, gap, tail, offset, reach: count => offset(count - 1) + pitch * .5 + tail };
  }
  function columnBands(clues, angle, font, numeralFont = font, spread, n = state.n) {
    const radius = .8 * 2 / n;
    const shift = radius / 2;
    const corner = columnStyle === "corner";
    const rise = corner ? radius / (2 * Math.sqrt(3)) : radius * Math.sqrt(3) / 2;
    const { pitch, gap, offset, reach } = columnMetrics(font, spread);
    const textHalf = value => numeralFont * .36 * String(value).length;
    const grouped = [[], []];
    for (const clue of clues) {
      const seg = clue.segment.map(p => rotatePoint(p, angle));
      const O = rotatePoint(clue.outward, angle);
      grouped[O[1] > 0 ? 1 : 0].push({ ...clue, seg, O, mid: mean(seg) });
    }
    const constraints = [];
    const sides = [];
    grouped.forEach((items, index) => {
      if (!items.length) return;
      const below = index === 1;
      const sign = below ? 1 : -1;
      items.sort((a, b) => a.mid[0] - b.mid[0]);
      const verts = [];
      for (const item of items) for (const point of item.seg)
        if (!verts.some(other => Math.hypot(other[0] - point[0], other[1] - point[1]) < 1e-5)) verts.push(point);
      verts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      items.forEach((item, rank) => {
        const pair = [verts[rank], verts[rank + 1]];
        const cornerY = below ? Math.max(pair[0][1], pair[1][1]) : Math.min(pair[0][1], pair[1][1]);
        item.anchor = cornerY + sign * rise;
        item.reach = reach(item.runs.length);
        item.numX = (pair[0][0] + pair[1][0]) / 2 + shift;
        item.runs.forEach((value, i) => {
          const half = textHalf(value);
          constraints.push({
            p: [item.numX, item.anchor], extra: [0, sign * offset(i)],
            min: [-half, -numeralFont / 2], max: [half, numeralFont / 2],
            axis: item.axis, row: item.row, run: i, value,
          });
        });
      });
      const lines = verts.map((vertex, line) => {
        const x = vertex[0] + shift;
        const neighbors = [];
        if (line > 0) neighbors.push(items[line - 1]);
        if (line < items.length) neighbors.push(items[line]);
        for (const item of neighbors) constraints.push({
          p: [x, item.anchor], extra: [0, sign * item.reach], min: [0, 0], max: [0, 0],
        });
        return { vertex, x, line, neighbors };
      });
      sides.push({ below, sign, O: items[0].O, rise, radius, gap, pitch, offset, lines, items, corner });
    });
    return { constraints, sides };
  }
  function clueAnchor(desktop, direction, font, value) {
    const right = desktop && direction[0] < 0;
    const top = !desktop && direction[1] > 0;
    const width = font * .72 * String(value).length;
    return {
      anchor: right ? "end" : "start", baseline: top ? "text-before-edge" : "text-after-edge",
      min: [right ? -width : 0, top ? 0 : -font],
      max: [right ? 0 : width, top ? font : 0],
    };
  }
  // Diagonal numerals step outward from the strip's exit, run 0 nearest the board.
  function diagonalNumerals(clue, angle, desktop, font) {
    const p = rotatePoint(clue.edge, angle), direction = rotatePoint(clue.outward, angle);
    return clue.runs.map((value, i) => ({
      p, extra: direction.map(v => v * (font + i * font * 1.5)), direction,
      axis: clue.axis, row: clue.row, run: i, value,
      ...clueAnchor(desktop, direction, font, value),
    }));
  }
  function pose(angle, desktop, font, withClues, columns, numeralFont = font, spread) {
    const outer = [vertex(0, 0, state.n), vertex(state.n, 0, state.n), vertex(0, state.n, state.n)].map(p => rotatePoint(p, angle));
    const clues = withClues ? clueRows(angle, desktop) : [];
    const constraints = outer.map(p => ({ p, extra: [0, 0], min: [0, 0], max: [0, 0] }));
    if (columns && clues.length) constraints.push(...columnBands(clues, angle, font, numeralFont, spread).constraints);
    else for (const clue of clues) constraints.push(...diagonalNumerals(clue, angle, desktop, font));
    return { clues, constraints };
  }
  let layoutCache = null;
  function fitBoard(width, height, base, desktop, font, solved, columns, numeralFont = font, spread = COLUMN_SPREADS[0]) {
    const key = JSON.stringify([width, height, base, font, numeralFont, spread, solved, !!columns, columnStyle, state.n, state.clues.map(axis => axis.map(row => row.runs))]);
    if (layoutCache?.key === key) return layoutCache;
    const poses = [0, 120, 240].map(turn => pose(base + turn, desktop, font, !solved, columns, numeralFont, spread));
    const constraints = poses.flatMap(p => p.constraints);
    // Fit the whole composition, allowing translation as well as scale. Every
    // pair of bounds limits scale independently of where the pivot is placed.
    // Include all resting orientations so turning cannot shift the pivot.
    const edge = screenEdge(desktop);
    let scale = Infinity;
    for (const axis of [0, 1]) {
      const available = (axis ? height : width) - 2 * edge;
      for (const high of constraints) for (const low of constraints) {
        const distance = high.p[axis] - low.p[axis];
        if (distance > 1e-7) scale = Math.min(scale,
          (available - high.extra[axis] - high.max[axis] + low.extra[axis] + low.min[axis]) / distance);
      }
    }
    // Below 1 the composition cannot fit; callers may retry with tighter clues.
    const fits = scale >= 1;
    scale = Math.max(1, scale);
    const center = [0, 1].map(axis => {
      const low = Math.min(...constraints.map(c => c.p[axis] * scale + c.extra[axis] + c.min[axis]));
      const high = Math.max(...constraints.map(c => c.p[axis] * scale + c.extra[axis] + c.max[axis]));
      return ((axis ? height : width) - low - high) / 2;
    });
    layoutCache = { key, poses, scale, center, fits };
    return layoutCache;
  }
  function finishAnimation() {
    if (!animation) return;
    visualTurn = animation.to;
    if (animation.scroll) wheelCooldownUntil = performance.now() + TURN_MS;
    animation = null;
  }
  function advanceAnimation() {
    if (!animation) return 1;
    const progress = motionEnabled ? Math.min(1, Math.max(0, (performance.now() - animation.start) / animation.duration)) : 1;
    const eased = progress * progress * (3 - 2 * progress);
    visualTurn = animation.from + (animation.to - animation.from) * eased;
    if (progress === 1) finishAnimation();
    return eased;
  }
  let mobileChoice = null;
  function widestRun() {
    let digits = 1;
    for (const axis of state.clues) for (const row of axis) for (const run of (row.runs.length ? row.runs : [0]))
      digits = Math.max(digits, String(run).length);
    return digits;
  }
  function chooseMobileLayout(width, height, base) {
    const key = JSON.stringify([width, height, base, columnStyle, state.n, state.clues.map(axis => axis.map(row => row.runs))]);
    if (mobileChoice?.key === key) return mobileChoice;
    const digits = widestRun();
    const pack = (columns, spread) => {
      const fit = font => fitBoard(width, height, base, false, font, false, columns, font, spread);
      const roomy = font => {
        const scale = fit(font).scale;
        const textWidth = font * .72 * digits;
        return scale >= 1 && (!columns || textWidth <= scale * SQRT3 / state.n * .8);
      };
      const maxScale = fit(8).scale;
      let font = 8;
      for (let candidate = columns ? 18 : 20; candidate >= 8; candidate--) {
        const scale = fit(candidate).scale;
        if (scale + 1e-6 >= maxScale * .97 && roomy(candidate)) { font = candidate; break; }
      }
      const fits = !columns || fitBoard(width, height, base, false, font, false, true, font * COLUMN_NUMERAL, spread).fits;
      return { columns, font, spread, fits, scale: fit(font).scale };
    };
    // Tall stacks on a short screen tighten from the full spacing only as far
    // as they must to stay on screen.
    let stacked;
    for (const spread of COLUMN_SPREADS) if ((stacked = pack(true, spread)).fits) break;
    const diagonal = pack(false);
    // Column clues are the portrait for every difficulty. A short, wide stage
    // still keeps diagonals when that leaves the cells larger.
    const choice = height >= width || stacked.scale >= diagonal.scale - .25 ? stacked : diagonal;
    mobileChoice = { key, ...choice };
    return mobileChoice;
  }
  function layout(width, height) {
    const desktop = window.innerWidth >= 900;
    // Desktop is base-up; mobile is base-left, turned 30° from desktop so the
    // corner pointing up-right on desktop points right on a phone.
    const base = desktop ? 0 : 30;
    const angle = base + visualTurn + preview;
    const maxRuns = Math.max(1, ...state.clues.flat().map(line => line.runs.length));
    const solved = state.won && !state.editing;
    let font, columns = false, spread;
    if (desktop) font = Math.max(8, Math.min(20, width / (state.n * 2.5), (height - 80) / (2.8 * maxRuns)));
    else if (solved) font = 8;
    else ({ font, columns, spread } = chooseMobileLayout(width, height, base));
    const numeralFont = columns ? font * COLUMN_NUMERAL : font;
    const fitted = fitBoard(width, height, base, desktop, font, solved, columns, numeralFont, spread);
    const resting = fitted.poses[view];
    const moving = animation !== null || preview !== 0;
    const restingScale = fitted.scale, center = fitted.center;
    const vertices = [vertex(0, 0, state.n), vertex(state.n, 0, state.n), vertex(0, state.n, state.n)];
    const edge = screenEdge(desktop);
    let scale = restingScale;
    if (moving) for (const point of vertices.map(p => rotatePoint(p, angle))) {
      for (const axis of [0, 1]) {
        const v = point[axis];
        if (v > 1e-7) scale = Math.min(scale, ((axis ? height : width) - edge - center[axis]) / v);
        else if (v < -1e-7) scale = Math.min(scale, (edge - center[axis]) / v);
      }
    }
    const toScreen = p => rotatePoint(p, angle).map((v, axis) => center[axis] + v * scale);
    return { width, height, desktop, angle, scale, center, font, columns, spread, toScreen, clues: moving ? [] : resting.clues,
      moving, outer: vertices.map(toScreen) };
  }
  // A solved column stays bright until its outside-in pulse has finished.
  function columnRestingDim(axis, row) {
    const entry = solvedRows.get(`${axis}:${row}`);
    if (!entry) return false;
    if (!motionEnabled || entry.start < 0) return true;
    return performance.now() - entry.start >= (entry.count - 1) * NUMERAL_STEP + NUMERAL_PULSE;
  }
  // options lets the tutorial draw its own board: n, an id prefix for the rail
  // gradients, and replacements for the numeral paint and resting dim.
  function drawColumns(fragment, geometry, cellColor, options = {}) {
    const {
      n = state.n, idPrefix = "clue-line", restingDim = columnRestingDim,
      numeral = (item, i) => numeralAttrs(item.axis, item.row, i, item.runs.length, cellColor, item.echoIndex),
    } = options;
    const place = (p, extra = [0, 0]) => [
      geometry.center[0] + p[0] * geometry.scale + extra[0],
      geometry.center[1] + p[1] * geometry.scale + extra[1],
    ];
    const { sides } = columnBands(geometry.clues, geometry.angle, geometry.font, geometry.font, geometry.spread, n);
    const defs = node("defs", {});
    fragment.append(defs);
    const font = geometry.font;
    for (const side of sides) {
      const sideName = side.below ? "below" : "above";
      for (const line of side.lines) {
        const start = place([line.x, line.vertex[1] + side.sign * side.rise]);
        const far = place([line.x, line.neighbors[0].anchor], [0, side.sign * line.neighbors[0].reach]);
        for (const item of line.neighbors) {
          const y = place([line.x, item.anchor], [0, side.sign * item.reach])[1];
          if (side.below ? y > far[1] : y < far[1]) far[1] = y;
        }
        const end = place(line.vertex);
        const id = `${idPrefix}-${sideName}-${line.line}`;
        const span = Math.abs(far[1] - start[1]) || 1;
        // Twice the former 0.62-pitch ramp, so the fade begins closer to the triangle.
        const solidAt = Math.min(.8, font * 1.24 / span);
        const gradient = node("linearGradient", {
          id, gradientUnits: "userSpaceOnUse", x1: 0, y1: far[1], x2: 0, y2: start[1],
        });
        for (const [offset, opacity] of [["0", "0"], [solidAt.toFixed(4), "1"], ["1", "1"]])
          gradient.append(node("stop", { offset, "stop-color": cellColor, "stop-opacity": opacity }));
        defs.append(gradient);
        const columnIds = line.neighbors.map(item => `${item.axis}:${item.row}`);
        const dimLine = columnIds.length >= 2 && line.neighbors.every(item => restingDim(item.axis, item.row));
        const attrs = {
          fill: "none", stroke: `url(#${id})`, "stroke-width": Math.max(1.2, font / 11),
          "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none",
          "data-rail": line.line, "data-side": sideName, "data-style": side.corner ? "corner" : "curve",
          "data-columns": columnIds.join(","),
          "data-direction-x": side.O[0], "data-direction-y": side.O[1],
          "data-far-x": far[0], "data-far-y": far[1],
          "data-near-x": start[0], "data-near-y": start[1],
          "data-end-x": end[0], "data-end-y": end[1],
        };
        if (dimLine) {
          attrs.opacity = .5;
          attrs["data-dim"] = "1";
        }
        if (side.corner) attrs.d = `M ${far[0]} ${far[1]} L ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`;
        else {
          const center = place([line.vertex[0] - side.radius / 2, line.vertex[1] + side.sign * side.rise]);
          const rs = [start[0] - center[0], start[1] - center[1]];
          const re = [end[0] - center[0], end[1] - center[1]];
          // Positive cross is clockwise in this y-down plane, which is SVG sweep 1.
          // The other flag draws the arc around the point instead of along the rank.
          const sweep = rs[0] * re[1] - rs[1] * re[0] > 0 ? 1 : 0;
          const radius = side.radius * geometry.scale;
          attrs.d = `M ${far[0]} ${far[1]} L ${start[0]} ${start[1]} A ${radius} ${radius} 0 0 ${sweep} ${end[0]} ${end[1]}`;
          attrs["data-cx"] = center[0]; attrs["data-cy"] = center[1]; attrs["data-radius"] = radius;
        }
        fragment.append(node("path", attrs));
      }
      for (const item of side.items) {
        const center = geometry.toScreen(item.center);
        item.runs.forEach((value, i) => {
          const at = place([item.numX, item.anchor], [0, side.sign * side.offset(i)]);
          fragment.append(node("text", {
            x: at[0], y: at[1], "text-anchor": "middle", "dominant-baseline": "central", "font-size": font * COLUMN_NUMERAL,
            "data-column": "1", "data-side": sideName,
            "data-axis": item.axis, "data-row": item.row, "data-run": i,
            "data-direction-x": side.O[0], "data-direction-y": side.O[1],
            "data-center-x": center[0], "data-center-y": center[1],
            ...numeral(item, i),
          }, value));
        });
      }
    }
  }
  // Hue turns with the board, measured from the puzzle's home view. During the
  // reveal it follows the extra turn so the palette settles smoothly.
  const revealProgress = () => call("celebrating") ? call("celebration_angle") / 360 : 1;
  window.triPuzzleHue = () => window.triMenuOpen || state?.editing ? 0
    : visualTurn + preview - homeView() * 120 - (reveal ? reveal.extra * (1 - revealProgress()) : 0);
  window.triDrawBoard = () => {
    if (!state?.cells) return;
    const rect = stage.getBoundingClientRect();
    advanceAnimation();
    applyPalette();
    // The victory wave starts at the visible point. Mobile's base is 30° past
    // desktop's, which puts the point on the corner desktop shows one turn later.
    call("effect_axis", [2, 1, 0][window.innerWidth >= 900 ? view : (view + 1) % 3]);
    const effects = call("effects", performance.now());
    const victory = !!call("celebrating");
    geometry = layout(Math.max(160, rect.width), Math.max(160, rect.height));
    const style = document.documentElement.style;
    const colours = ["--empty", "--cell"].map(key => style.getPropertyValue(key).trim());
    if (state.won && !state.editing) {
      const nextFill = TriPalette.oklch(.7, .16, motionEnabled ? performance.now() / 24 % 360 : 145);
      el("next-puzzle").style.setProperty("--next-fill", nextFill);
      el("next-puzzle").style.setProperty("--next-ink", TriPalette.ink(nextFill));
    }
    const shareHelp = el("share-help");
    if (shareHelp && !shareHelp.hidden && (state.undo || turns > 0)) shareHelpSettled = true;
    const shareHelpAttention = shareHelp && !shareHelp.hidden && !shareHelpSettled && !state.editing && !state.won;
    if (shareHelpAttention) {
      const helpFill = TriPalette.oklch(.7, .16, motionEnabled ? performance.now() / 24 % 360 : 145);
      shareHelp.style.setProperty("--next-fill", helpFill);
      shareHelp.style.setProperty("--next-ink", TriPalette.ink(helpFill));
    } else if (shareHelp) {
      shareHelp.style.removeProperty("--next-fill");
      shareHelp.style.removeProperty("--next-ink");
    }
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    // Both ordinary turns and the celebration use the triangle centroid.
    // A nearby cell centre is off-center whenever the side length is divisible by three.
    const fragment = node("g", { "data-board-layer": "" });
    if (victory) {
      const pivot = geometry.center;
      const spin = reveal ? call("celebration_angle") * reveal.total / 360 - reveal.extra : call("celebration_angle");
      fragment.setAttribute("transform", `translate(${pivot.join(" ")}) rotate(${spin}) scale(${call("celebration_scale")}) translate(${-pivot[0]} ${-pivot[1]})`);
      fragment.dataset.pivot = pivot.join(",");
    }
    state.cells.forEach((cell, index) => {
      if (!cell.active) return;
      const points = corners(cell, state.n).map(geometry.toScreen), mid = mean(points);
      const inset = Math.max(.8, 1 - 2 / (geometry.scale / state.n));
      const drawn = points.map(p => p.map((v, a) => mid[a] + (v - mid[a]) * inset));
      const glow = call("light", index);
      const flashStage = call("flash_stage", index);
      const fill = glow > 0 ? TriPalette.flash(colours[cell.state === 1 ? 1 : 0], flashStage, glow, themeMode)
        : cell.state === 1 ? "var(--cell)" : "var(--empty)";
      const polygon = node("polygon", { points: drawn.map(p => p.join(",")).join(" "), fill, "fill-opacity": cell.state === 2 ? .5 : 1, "data-glow": glow, "data-flash-stage": flashStage, "data-cell": index, "aria-label": TriCopy.t("cell.label", { number: index + 1, state: TriCopy.t(["cell.empty", "cell.filled", "cell.crossed"][cell.state]) }) });
      fragment.append(polygon);
      if (cell.state === 2) fragment.append(node("text", { x: mid[0], y: mid[1], "text-anchor": "middle", "dominant-baseline": "central", "font-size": Math.max(9, Math.min(20, geometry.scale / state.n / 2)), fill: TriPalette.ink(TriPalette.mix(style.getPropertyValue("--bg"), glow > 0 ? fill : colours[0], .5)) }, "×"));
    });
    if (!state.won || state.editing) {
      if (geometry.columns) drawColumns(fragment, geometry, colours[1] || "#ffffff");
      else for (const clue of geometry.clues) {
        const edge = geometry.toScreen(clue.edge), center = geometry.toScreen(clue.center);
        for (const { value, run: i, extra, direction, anchor, baseline } of diagonalNumerals(clue, geometry.angle, geometry.desktop, geometry.font)) {
          fragment.append(node("text", {
            x: edge[0] + extra[0],
            y: edge[1] + extra[1],
            "text-anchor": anchor, "dominant-baseline": baseline, "font-size": geometry.font,
            "data-axis": clue.axis, "data-row": clue.row, "data-run": i,
            "data-center-x": center[0], "data-center-y": center[1],
            "data-direction-x": direction[0], "data-direction-y": direction[1],
            ...numeralAttrs(clue.axis, clue.row, i, clue.runs.length, colours[1] || "#ffffff", clue.echoIndex),
          }, value));
        }
      }
    }
    svg.replaceChildren(fragment);
    el("turn-left").disabled = el("turn-right").disabled = !!animation;
    if (animation || clueFlashPending() || (shareHelpAttention && motionEnabled) || (effects && !window.triMenuOpen)) requestFrame();
  };

  function turn(delta, scroll = false) {
    if (!mayPlay() || state.won || animation) return;
    wheelAmount = 0; wheelLast = -Infinity;
    clock();
    advanceAnimation();
    const steps = Math.trunc(delta);
    const from = visualTurn + preview;
    const to = (animation?.to ?? visualTurn) + steps * 120;
    view = ((view + steps) % 3 + 3) % 3;
    if (!state.editing) turns += Math.abs(steps);
    else window.triSetPuzzleOrientation?.(view);
    preview = 0;
    if (motionEnabled && Math.abs(to - from) > .01) {
      animation = { from, to, scroll, start: performance.now(),
        duration: Math.max(160, Math.min(650, TURN_MS * Math.abs(to - from) / 120)) };
      visualTurn = from;
    } else {
      visualTurn = to; animation = null;
      if (scroll) wheelCooldownUntil = performance.now() + TURN_MS;
    }
    clock(); saveAttempt(true); requestFrame();
  }
  el("turn-left").onclick = () => turn(-1);
  el("turn-right").onclick = () => turn(1);
  svg.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); turn(e.key === "ArrowRight" ? 1 : -1); }
  });
  svg.addEventListener("wheel", e => {
    if (!mayPlay() || state.won) return;
    e.preventDefault();
    const now = performance.now();
    // Discard momentum during the turn and for one full turn duration after
    // it finishes. Ignored deltas never contribute to the next gesture.
    if (animation || now < wheelCooldownUntil) {
      wheelAmount = 0; wheelLast = -Infinity;
      return;
    }
    if (now - wheelLast > 180) wheelAmount = 0;
    wheelLast = now;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAmount += delta * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(wheelAmount) >= 45) { turn(Math.sign(wheelAmount), true); }
  }, { passive: false });
  const pointerPosition = e => [e.clientX, e.clientY];
  function pairAngle() {
    const [a, b] = [...pointers.values()];
    return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  }
  function cancelGesture() { pointers.clear(); gesture = null; preview = 0; finishAnimation(); requestFrame(); }
  function enginePoint(index) {
    const c = state.cells[index], n = state.n;
    const half = Math.min((900 - 96) / 2, (760 - 144) / SQRT3);
    return [450 + (c.j - c.i) * half / n, 380 - half * SQRT3 / 2 + (n - c.i - c.j - (c.o ? 4 / 3 : 2 / 3)) * half / n * SQRT3];
  }
  // On a phone a drag turns the board like a wheel about its pivot: rightward
  // below the pivot, or upward left of it, turns counterclockwise. The side is
  // fixed where the drag starts. [horizontal sign, vertical sign]
  function wheelSigns(e) {
    if (window.innerWidth >= 900 || !geometry) return [1, 1];
    const rect = stage.getBoundingClientRect();
    return [e.clientY - rect.top > geometry.center[1] ? -1 : 1, e.clientX - rect.left < geometry.center[0] ? -1 : 1];
  }
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("pointerdown", e => {
    if (!mayPlay() || state.won || animation || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault(); svg.focus({ preventScroll: true });
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointerPosition(e));
    if (pointers.size === 1) gesture = { start: pointerPosition(e), cell: e.target.closest?.("[data-cell]")?.getAttribute("data-cell"), tool: e.button === 2 ? 2 : 1, moved: false, twist: false, delta: 0, wheel: wheelSigns(e) };
    else if (pointers.size === 2) { gesture.twist = true; gesture.lastAngle = pairAngle(); gesture.delta = 0; preview = 0; }
    else { gesture.cancelled = true; preview = 0; }
  });
  svg.addEventListener("pointermove", e => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pointerPosition(e));
    if (gesture.cancelled) return;
    if (gesture.twist && pointers.size === 2) {
      const angle = pairAngle();
      const difference = ((angle - gesture.lastAngle + 540) % 360) - 180;
      gesture.delta += difference; gesture.lastAngle = angle;
      preview = gesture.delta; requestFrame();
    } else if (!gesture.twist) {
      const dx = e.clientX - gesture.start[0], dy = e.clientY - gesture.start[1];
      if (Math.hypot(dx, dy) > 8) gesture.moved = true;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      gesture.delta = (horizontal ? dx : dy) * gesture.wheel[horizontal ? 0 : 1] * (window.innerWidth < 900 ? .5 : 1);
      if (gesture.moved) { preview = Math.max(-120, Math.min(120, gesture.delta)); requestFrame(); }
    }
  });
  function release(e, cancelled = false) {
    if (!pointers.has(e.pointerId)) return;
    const current = gesture;
    pointers.delete(e.pointerId);
    if (cancelled && current) current.cancelled = true;
    if (pointers.size || !current) return;
    gesture = null;
    if (!current.cancelled && mayPlay() && !state.won) {
      if (current.twist) turn(Math.round(current.delta / 120));
      else if (current.moved && Math.abs(current.delta) >= 45) turn(Math.sign(current.delta));
      else if (!current.moved && current.cell !== undefined) {
        const index = Number(current.cell);
        if (state.cells[index]?.active) { fit(); baseCall("down", ...enginePoint(index), current.tool); baseCall("up"); call("effects", performance.now()); }
      }
      else if (preview) turn(0);
    } else if (preview && mayPlay() && !state.won) turn(0);
    else preview = 0;
    requestFrame();
  }
  svg.addEventListener("pointerup", e => release(e));
  svg.addEventListener("pointercancel", e => release(e, true));
  svg.addEventListener("lostpointercapture", e => release(e, true));

  function brag() {
    const text = TriCopy.t("share.result", { time: formatTime(finished.elapsed), count: finished.turns });
    const url = state.custom ? TriShare.url(currentPuzzle)
      : (state.tutorial >= 0 ? TriShare.url({ size: state.n, solution: state.solution }) : `${TriShare.base}#level=${state.level}`);
    return { title: TriCopy.t("app.name"), text, url };
  }
  el("share-result").onclick = async () => {
    if (!state?.won || !finished || finished.unknown) return;
    const data = brag();
    if (navigator.share) {
      try { await navigator.share(data); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    const text = `${data.text}\n${data.url}`;
    try { await navigator.clipboard.writeText(text); toast(TriCopy.t("rotate.result-and-puzzle-link-copied")); }
    catch { copyPanel.hidden = false; el("result-text").value = text; el("result-text").focus(); el("result-text").select(); }
  };
  const clueStyle = document.getElementById("clue-style");
  if (clueStyle) {
    clueStyle.value = columnStyle;
    const phoneClueLabel = clueStyle.closest("label");
    const syncPhoneClueSetting = () => { if (phoneClueLabel) phoneClueLabel.hidden = window.innerWidth >= 900; };
    syncPhoneClueSetting();
    window.addEventListener("resize", syncPhoneClueSetting);
    clueStyle.addEventListener("change", () => {
      columnStyle = clueStyle.value === "corner" ? "corner" : "curve";
      try { localStorage.setItem("delta-triplex-clue-style", columnStyle); } catch {}
      layoutCache = null;
      mobileChoice = null;
      requestFrame();
    });
  }
  // The same clue geometry drawn on the tutorial's demonstration triangle.
  window.TriBoardGeometry = {
    vertex, corners, rotatePoint, mean, axisRow, clueRows, diagonalNumerals, columnBands, drawColumns,
    columnNumeral: COLUMN_NUMERAL, columnSpreads: COLUMN_SPREADS,
  };
  // Read-only hooks for deterministic prototype regression tests.
  window.TriRotation = {
    formatTime, numeralStep: NUMERAL_STEP, numeralPulse: NUMERAL_PULSE, dimFlashPaint,
    get stats() { return { view, elapsed, turns, running, finished, animating: !!animation }; },
    get geometry() { return geometry; },
  };
  if (state) { window.triRotateState(state, null); requestFrame(); }
})();
