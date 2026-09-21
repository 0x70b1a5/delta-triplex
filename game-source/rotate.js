"use strict";
// SVG view over the shared C rules engine. Puzzle coordinates never turn.
// Only this session's view, gestures and counters know about rotation.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const SQRT3 = Math.sqrt(3);
  const EDGE = 24;
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
  let elapsed = 0, turns = 0, lastTick = performance.now(), running = false;
  let finished = null, previousWon = false, geometry = null;
  let attemptKey = "", lastSaved = -Infinity;
  let attempts = {};
  try { attempts = JSON.parse(localStorage.getItem("tri-rotate-attempts-v1")) || {}; } catch {}
  function saveAttempt(force = false) {
    if (!attemptKey || (!force && performance.now() - lastSaved < 1000)) return;
    attempts[attemptKey] = { elapsed, turns, view, finished };
    try { localStorage.setItem("tri-rotate-attempts-v1", JSON.stringify(attempts)); } catch {}
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
    if (restart || key !== boardKey) {
      cancelGesture();
      saveAttempt(true);
      const forceFresh = restart;
      key = boardKey; restart = false; view = visualTurn = preview = 0; animation = null;
      elapsed = turns = 0; finished = null; previousWon = false;
      lastTick = performance.now();
      // Built-in progress survives reload/navigation; its stopwatch must, too.
      // Custom imports/trials start with an empty board and therefore a fresh attempt.
      attemptKey = !next.custom ? `${next.tutorial}/${next.level}/${next.solution.join("")}` : "";
      const saved = !forceFresh && attemptKey && attempts[attemptKey];
      if (saved && Number.isFinite(saved.elapsed) && saved.elapsed >= 0 && Number.isInteger(saved.turns) && saved.turns >= 0) {
        elapsed = saved.elapsed; turns = saved.turns;
        view = Number.isInteger(saved.view) ? ((saved.view % 3) + 3) % 3 : 0;
        finished = saved.finished;
      }
      visualTurn = view * 120;
      if (next.won && !finished) finished = { unknown: true };
    }
    if (next.won && !next.editing && !previousWon && !finished) finished = { elapsed, turns };
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
  function clueRows(angle, desktop) {
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
      for (let row = 0; row < state.n; row++) {
        const cells = state.cells.filter(c => axisRow(c, axis, state.n) === row);
        cells.sort((a, b) => (2 * (axis === 0 ? b.j : b.i) + b.o) - (2 * (axis === 0 ? a.j : a.i) + a.o));
        const endpoint = first ? cells[0] : cells[cells.length - 1];
        const center = mean(corners(endpoint, state.n));
        const distance = Math.min(...normals.filter(n => dot(outward, n) > 1e-6)
          .map(n => (SQRT3 / 3 - dot(center, n)) / dot(outward, n)));
        const edge = center.map((v, a) => v + distance * outward[a]);
        const runs = state.clues[axis][row].runs.length ? [...state.clues[axis][row].runs] : [0];
        if (first) runs.reverse();
        result.push({ axis, row, center, edge, outward, runs });
      }
    }
    return result;
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
  function pose(angle, desktop, font, withClues) {
    const outer = [vertex(0, 0, state.n), vertex(state.n, 0, state.n), vertex(0, state.n, state.n)].map(p => rotatePoint(p, angle));
    const clues = withClues ? clueRows(angle, desktop) : [];
    const constraints = outer.map(p => ({ p, extra: [0, 0], min: [0, 0], max: [0, 0] }));
    for (const clue of clues) {
      const direction = rotatePoint(clue.outward, angle);
      clue.runs.forEach((value, i) => constraints.push({
        p: rotatePoint(clue.edge, angle), extra: direction.map(v => v * (font + i * font * 1.5)),
        ...clueAnchor(desktop, direction, font, value),
      }));
    }
    return { clues, constraints };
  }
  let layoutCache = null;
  function fitBoard(width, height, base, desktop, font, solved) {
    const key = JSON.stringify([width, height, base, font, solved, state.n, state.clues.map(axis => axis.map(row => row.runs))]);
    if (layoutCache?.key === key) return layoutCache;
    const poses = [0, 120, 240].map(turn => pose(base + turn, desktop, font, !solved));
    const constraints = poses.flatMap(p => p.constraints);
    // Fit the whole composition, allowing translation as well as scale. Every
    // pair of bounds limits scale independently of where the pivot is placed.
    // Include all resting orientations so turning cannot shift the pivot.
    let scale = Infinity;
    for (const axis of [0, 1]) {
      const available = (axis ? height : width) - 2 * EDGE;
      for (const high of constraints) for (const low of constraints) {
        const distance = high.p[axis] - low.p[axis];
        if (distance > 1e-7) scale = Math.min(scale,
          (available - high.extra[axis] - high.max[axis] + low.extra[axis] + low.min[axis]) / distance);
      }
    }
    scale = Math.max(1, scale);
    const center = [0, 1].map(axis => {
      const low = Math.min(...constraints.map(c => c.p[axis] * scale + c.extra[axis] + c.min[axis]));
      const high = Math.max(...constraints.map(c => c.p[axis] * scale + c.extra[axis] + c.max[axis]));
      return ((axis ? height : width) - low - high) / 2;
    });
    layoutCache = { key, poses, scale, center };
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
  function layout(width, height) {
    const desktop = window.innerWidth >= 900;
    const base = desktop ? 0 : -90;
    const angle = base + visualTurn + preview;
    const maxRuns = Math.max(1, ...state.clues.flat().map(line => line.runs.length));
    const font = Math.max(8, Math.min(20, width / (state.n * 2.5), (height - 80) / (2.8 * maxRuns)));
    const solved = state.won && !state.editing;
    const fitted = fitBoard(width, height, base, desktop, font, solved);
    const resting = fitted.poses[view];
    const moving = animation !== null || preview !== 0;
    const restingScale = fitted.scale, center = fitted.center;
    const vertices = [vertex(0, 0, state.n), vertex(state.n, 0, state.n), vertex(0, state.n, state.n)];
    let scale = restingScale;
    if (moving) for (const point of vertices.map(p => rotatePoint(p, angle))) {
      for (const axis of [0, 1]) {
        const v = point[axis];
        if (v > 1e-7) scale = Math.min(scale, ((axis ? height : width) - EDGE - center[axis]) / v);
        else if (v < -1e-7) scale = Math.min(scale, (EDGE - center[axis]) / v);
      }
    }
    const toScreen = p => rotatePoint(p, angle).map((v, axis) => center[axis] + v * scale);
    return { width, height, desktop, angle, scale, center, font, toScreen, clues: moving ? [] : resting.clues,
      moving, outer: vertices.map(toScreen) };
  }
  window.triPuzzleHue = () => window.triMenuOpen || state?.editing ? 0 : visualTurn + preview;
  window.triDrawBoard = () => {
    if (!state?.cells) return;
    const rect = stage.getBoundingClientRect();
    advanceAnimation();
    applyPalette();
    call("effect_axis", [2, 1, 0][view]);
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
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    // Match raylib's celebration camera: rotate/zoom the already laid-out
    // board about its central active cell. Ordinary turns use the triangle centroid.
    const fragment = node("g", { "data-board-layer": "" });
    if (victory) {
      const cell = state.cells[call("celebration_cell")];
      const pivot = cell ? geometry.toScreen(mean(corners(cell, state.n))) : [geometry.width / 2, geometry.height / 2];
      fragment.setAttribute("transform", `translate(${pivot.join(" ")}) rotate(${call("celebration_angle")}) scale(${call("celebration_scale")}) translate(${-pivot[0]} ${-pivot[1]})`);
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
    if (!state.won || state.editing) for (const clue of geometry.clues) {
      const edge = geometry.toScreen(clue.edge), center = geometry.toScreen(clue.center);
      const direction = rotatePoint(clue.outward, geometry.angle);
      clue.runs.forEach((value, i) => {
        const alignment = clueAnchor(geometry.desktop, direction, geometry.font, value);
        fragment.append(node("text", {
        x: edge[0] + direction[0] * (geometry.font + i * geometry.font * 1.5),
        y: edge[1] + direction[1] * (geometry.font + i * geometry.font * 1.5),
        "text-anchor": alignment.anchor, "dominant-baseline": alignment.baseline, "font-size": geometry.font,
        fill: "var(--cell)",
        "data-axis": clue.axis, "data-row": clue.row, "data-run": i,
        "data-center-x": center[0], "data-center-y": center[1],
        "data-direction-x": direction[0], "data-direction-y": direction[1],
      }, value));
      });
    }
    svg.replaceChildren(fragment);
    el("turn-left").disabled = el("turn-right").disabled = !!animation;
    if (animation || (effects && !window.triMenuOpen)) requestFrame();
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
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("pointerdown", e => {
    if (!mayPlay() || state.won || animation || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault(); svg.focus({ preventScroll: true });
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointerPosition(e));
    if (pointers.size === 1) gesture = { start: pointerPosition(e), cell: e.target.closest?.("[data-cell]")?.getAttribute("data-cell"), tool: e.button === 2 ? 2 : 1, moved: false, twist: false, delta: 0 };
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
      gesture.delta = (Math.abs(dx) >= Math.abs(dy) ? dx : dy) * (window.innerWidth < 900 ? .5 : 1);
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
  // Read-only hooks for deterministic prototype regression tests.
  window.TriRotation = { formatTime, get stats() { return { view, elapsed, turns, running, finished, animating: !!animation }; }, get geometry() { return geometry; } };
  if (state) { window.triRotateState(state, null); requestFrame(); }
})();
