"use strict";
const el = (e) => document.getElementById(e),
  canvas = el("canvas"),
  stage = el("stage");
let appReady = !1,
  state = null,
  gridKey = "",
  framePending = 0,
  dirty = !1,
  drawCount = 0,
  renderWidth = 900,
  renderHeight = 760,
  toastTimer = 0,
  shineTimer = 0;
const motionPreference = window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
);
let motionEnabled = !motionPreference?.matches;
function scheduleShine() { clearTimeout(shineTimer); shineTimer = 0; }
motionPreference?.addEventListener("change", (e) => {
  ((motionEnabled = !e.matches),
    call("motion", motionEnabled ? 1 : 0),
    scheduleShine(),
    requestFrame());
});
let activePointer = null,
  caretHits = 0,
  lastCaret = 0;
const lessons = [
  [
    "1 / 3 · Four cells",
    "Numbers outside the triangle describe touching filled cells. Read each clue from outside toward the board. A 0 means leave that strip empty. Tap to fill, tap again to cross, and again to clear.",
  ],
  [
    "2 / 3 · Nine cells",
    "Multiple numbers describe separate runs with an empty cell between them. One side has no clues: swipe, scroll, or twist with two fingers to reveal it. Every turn is 120°.",
  ],
  [
    "3 / 3 · Sixteen cells",
    "Every cell belongs to three strips. Turn to inspect all three sets of clues. Your active solving time and completed turns are recorded; share your result when you finish.",
  ],
];
function toast(e) {
  (clearTimeout(toastTimer),
    (el("toast").textContent = e),
    (el("toast").hidden = !1),
    (toastTimer = setTimeout(() => {
      el("toast").hidden = !0;
    }, 2800)));
}
function call(e, ...t) {
  if (appReady) return Module["_game_" + e](...t);
}
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");
let themeMode = "system", colorfulPalette = TriPalette.random();
const chosenColours = {};
try {
  const saved = localStorage.getItem("delta-triplex-theme");
  if (["system", "light", "dark", "colorful"].includes(saved)) themeMode = saved;
} catch {}
try {
  const saved = JSON.parse(localStorage.getItem("delta-triplex-rotation-colours"));
  for (const key of ["bg", "cell"])
    if (/^#[0-9a-f]{6}$/i.test(saved?.[key])) chosenColours[key] = saved[key];
} catch {}
function currentTheme(base = colorfulPalette) {
  const mode = themeMode === "system" ? (themePreference?.matches ? "dark" : "light") : themeMode;
  return TriPalette.theme(mode, chosenColours, base);
}
function writeTheme(target, theme) {
  for (const [name, value] of Object.entries(theme))
    target.style.setProperty("--" + name, value);
  target.style.setProperty("--home-cell-ink", TriPalette.ink(theme.cell));
  target.style.setProperty("--home-empty-ink", theme.cross);
}
function applyPalette() {
  const theme = currentTheme();
  writeTheme(document.documentElement, theme);
  document.documentElement.style.colorScheme = theme.ink === "#ffffff" ? "dark" : "light";
  for (const [id, key] of [["background-color", "bg"], ["cell-color", "cell"]]) {
    el(id).value = theme[key];
    el("clear-colour-" + key).hidden = !chosenColours[key];
  }
  el("theme-mode").value = themeMode;
  call("flash_colorful", themeMode === "colorful" ? 1 : 0);
  call("palette", ...[theme.bg, theme.cell, theme.empty, theme.cross, theme.a, theme.b, theme.c]
    .map(value => parseInt(value.slice(1), 16)));
}
el("theme-mode").addEventListener("change", () => {
  themeMode = el("theme-mode").value;
  try { localStorage.setItem("delta-triplex-theme", themeMode); } catch {}
  applyPalette(); window.triHomeChanged?.(); requestFrame();
});
themePreference?.addEventListener("change", () => {
  if (themeMode === "system") { applyPalette(); window.triHomeChanged?.(); requestFrame(); }
});
function updateChosenColour(key, value) {
  if (value) chosenColours[key] = value; else delete chosenColours[key];
  try { localStorage.setItem("delta-triplex-rotation-colours", JSON.stringify(chosenColours)); } catch {}
  applyPalette(); window.triHomeChanged?.(); requestFrame();
}
for (const [id, key] of [["background-color", "bg"], ["cell-color", "cell"]]) {
  el(id).addEventListener("input", () => updateChosenColour(key, el(id).value));
  el(id).addEventListener("change", () => {
    const theme = currentTheme();
    if (TriPalette.contrast(theme.bg, theme.cell) < 6)
      toast("Low contrast: choose a lighter cell or darker background (or vice versa).");
  });
  el("clear-colour-" + key).onclick = () => { updateChosenColour(key); el(id).focus(); };
  el("dice-" + key).onclick = () => updateChosenColour(key,
    TriPalette.randomColor(currentTheme()[key === "bg" ? "cell" : "bg"]));
}
applyPalette();
function fit() {
  // The rules engine uses a stable coordinate system; SVG owns the responsive view.
  renderWidth = 900; renderHeight = 760;
  call("resize", renderWidth, renderHeight);
}
function requestFrame() {
  if (!appReady || document.hidden || framePending) return;
  framePending = requestAnimationFrame(() => {
    framePending = 0;
    fit();
    window.triDrawBoard?.();
    drawCount++;
  });
}
// Keep engine/save axes stable; display them in rotational A, B, C order.
const displayAxes = [1, 2, 0];
const axisLabels = ["C", "A", "B"];
function axisArrows() {
  return [
    ["↙", "↘", "→"],
    ["↘", "↗", "↑"],
    ["↗", "↖", "←"],
    ["↖", "↙", "↓"],
  ][state?.orientation || 0];
}
function makeGrid(e) {
  el("clues").replaceChildren();
  const t = axisArrows().map(
      (arrow, i) => axisLabels[i] + " " + arrow,
    ),
    n = t;
  for (const r of displayAxes) {
    const a = document.createElement("div");
    ((a.className = "clue-column"),
      a.style.setProperty("--axis", ["var(--a)", "var(--b)", "var(--c)"][r]));
    const o = document.createElement("div");
    ((o.className = "axis"),
      (o.textContent = t[r]),
      (o.title = n[r]),
      (o.style.color = ["var(--a)", "var(--b)", "var(--c)"][r]),
      a.append(o));
    for (let t = 0; t < e; t++) {
      const e = document.createElement("button");
      ((e.className = "clue"), (e.id = `clue-${r}-${t}`));
      const n = document.createElement("small");
      n.textContent = axisLabels[r] + (t + 1);
      const o = document.createElement("span");
      (e.append(n, o), (e.onclick = () => call("select", r, t)), a.append(e));
    }
    el("clues").append(a);
  }
}
((window.triDiagnostics = () => ({
  frames: drawCount,
  pending: !!framePending,
  dirty: dirty,
})),
  (window.triState = function (e) {
    const t = state;
    state = e;
    const n = `${state.custom ? state.revision : "normal"}/${state.tutorial}/${state.level}/${state.n}/${state.orientation}`;
    (n !== gridKey &&
      ((gridKey = n),
      makeGrid(state.n),
      (t && t.custom === state.custom && t.level === state.level &&
        t.tutorial === state.tutorial && t.revision === state.revision) ||
        (colorfulPalette = TriPalette.random()),
      scheduleShine()),
      applyPalette());
    for (let e = 0; e < 3; e++)
      for (let t = 0; t < state.n; t++) {
        const n = el(`clue-${e}-${t}`),
          r = state.clues[e][t],
          a = r.runs.length ? r.runs.join(" ") : "0";
        ((n.lastElementChild.textContent = a),
          (n.dataset.long = String(a.length > 7)),
          (n.dataset.match = String(r.match)),
          (n.dataset.hover = String(state.hover[e] === t)),
          n.setAttribute(
            "aria-pressed",
            String(state.axis === e && state.row === t),
          ),
          n.setAttribute(
            "aria-label",
            `${axisLabels[e]}${t + 1}: ${a}${r.match ? ", runs match" : ""}`,
          ));
      }
    const r = state.clues[state.axis][state.row];
    ((el("strip-label").textContent =
      axisArrows()[state.axis] +
      " " +
      (r.runs.length ? r.runs.join(" ") : "0")),
      (el("strip-label").style.color = ["var(--a)", "var(--b)", "var(--c)"][
        state.axis
      ]),
      (el("undo").disabled = !state.undo),
      (el("app").dataset.tutorial = String(state.tutorial >= 0)),
      (el("lesson").hidden = state.tutorial < 0),
      state.tutorial >= 0 &&
        ((el("lesson-title").textContent = lessons[state.tutorial][0]),
        (el("lesson-text").textContent = lessons[state.tutorial][1]),
        (el("continue").hidden = !state.won),
        (el("continue").textContent =
          2 === state.tutorial ? "Start puzzles" : "Next demo")));
    window.triBuildLevels?.(state.levels);
    (      (el("app").dataset.orientation = ["S", "E", "N", "W"][
        state.orientation || 0
      ]),
      (el("app").dataset.custom = String(!!state.custom)),
      window.triCustomState?.(state),
      window.triFlowState?.(state, t),
      window.triRotateState?.(state, t),
      requestFrame());
  }));
function caret() {
  const e = performance.now();
  ((caretHits = e - lastCaret <= 1400 ? caretHits + 1 : 1),
    (lastCaret = e),
    3 === caretHits && ((caretHits = 0), toggleMenu(menu.hidden)));
}
function point(e) {
  const t = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - t.left) * renderWidth) / t.width,
    y: ((e.clientY - t.top) * renderHeight) / t.height,
  };
}
function startStroke(e, t) {
  (call("down", e.x, e.y, t), activePointer && (activePointer.started = !0));
}
function endPointer(e, t = !1) {
  if (activePointer && activePointer.id === e.pointerId) {
    if (
      (clearTimeout(activePointer.timer),
      t || activePointer.started || startStroke(activePointer.p, 1),
      !t && activePointer.started && !state?.won)
    ) {
      const t = point(e);
      call("move", t.x, t.y);
    }
    (call("up"),
      (activePointer = null),
      call("hover", -100, -100),
      canvas.hasPointerCapture(e.pointerId) &&
        canvas.releasePointerCapture(e.pointerId));
  }
}
let sizeObserver;
((el("undo").onclick = () => {
  (call("undo"), toast("Undone."));
}),
  (el("reset").onclick = () => {
    (call("reset"), toast("Board cleared. Undo restores it."));
  }),
  (el("skip").onclick = () => {
    (call("skip"), toast("Introduction skipped."));
  }),
  (el("continue").onclick = () => call("next")),
  (el("replay").onclick = () => {
    (call("replay"), (el("utilities").hidden = !0));
  }),
  (el("caret").onclick = caret),
  document.addEventListener("keydown", (e) => {
    if (window.triMenuOpen || el("theme-welcome").open) return;
    "^" !== e.key
      ? e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(e.target?.tagName) ||
        e.target?.isContentEditable ||
        ("z" === e.key.toLowerCase() && (e.preventDefault(), call("undo")),
        "r" === e.key.toLowerCase() &&
          (e.preventDefault(),
          call("reset"),
          toast("Board cleared. Undo restores it.")),
        "Escape" === e.key &&
          ((el("utilities").hidden = !0), memoryToggle(false)))
      : e.repeat || caret();
  }),
  canvas.addEventListener("contextmenu", (e) => e.preventDefault()),
  canvas.addEventListener("pointerdown", (e) => {
    if (
      !appReady ||
      state?.won ||
      window.triMenuOpen ||
      activePointer ||
      (0 !== e.button && 2 !== e.button)
    )
      return;
    (e.preventDefault(), canvas.focus({ preventScroll: !0 }), fit());
    const t = point(e);
    ((activePointer = {
      id: e.pointerId,
      touch: "touch" === e.pointerType,
      started: !1,
      p: t,
      startX: e.clientX,
      startY: e.clientY,
      timer: 0,
    }),
      canvas.setPointerCapture(e.pointerId),
      activePointer.touch ? void 0 : startStroke(t, 2 === e.button ? 2 : 1));
  }),
  canvas.addEventListener("pointermove", (e) => {
    if (!appReady || state?.won || window.triMenuOpen) return;
    const t = point(e);
    activePointer && activePointer.id === e.pointerId
      ? (!activePointer.started &&
          Math.hypot(
            e.clientX - activePointer.startX,
            e.clientY - activePointer.startY,
          ) > 7 &&
          (clearTimeout(activePointer.timer), startStroke(activePointer.p, 1)),
        activePointer.started && call("move", t.x, t.y))
      : activePointer || "touch" === e.pointerType || call("hover", t.x, t.y);
  }),
  canvas.addEventListener("pointerup", (e) => endPointer(e)),
  canvas.addEventListener("pointercancel", (e) => endPointer(e, !0)),
  canvas.addEventListener("lostpointercapture", (e) => endPointer(e, !0)),
  canvas.addEventListener("pointerleave", () => {
    activePointer || call("hover", -100, -100);
  }),
  window.addEventListener("blur", () => {
    (activePointer &&
      (clearTimeout(activePointer.timer), (activePointer = null), call("up")),
      call("hover", -100, -100));
  }),
  window.addEventListener("resize", requestFrame),
  window.visualViewport &&
    window.visualViewport.addEventListener("resize", requestFrame),
  document.addEventListener("fullscreenchange", requestFrame),
  document.addEventListener("visibilitychange", () => {
    document.hidden
      ? (framePending &&
          (cancelAnimationFrame(framePending), (framePending = 0)),
        call("up"),
        call("clear_effects"),
        clearTimeout(shineTimer),
        (shineTimer = 0),
        stopMemoryTimer())
      : (requestFrame(), startMemoryTimer(), scheduleShine());
  }),
  (window.triReady = function () {
    ((appReady = !0),
      call("motion", motionEnabled ? 1 : 0),
      scheduleShine(),
      (el("status").hidden = !0),
      fit(),
      call("sync"),
      window.triInitializeCustom?.(),
      (sizeObserver = new ResizeObserver(requestFrame)),
      sizeObserver.observe(stage),
      requestFrame());
  }),
  (el("fullscreen").onclick = async () => {
    try {
      document.fullscreenElement
        ? await document.exitFullscreen()
        : await document.documentElement.requestFullscreen();
    } catch (e) {
      toast("Fullscreen is unavailable in this viewer.");
    }
  }),
  document.fullscreenEnabled || (el("fullscreen").hidden = !0),
  (window.triMemoryEnabled = !1));
let memorySamples = [],
  memoryBaseline = null,
  memoryPeak = 0,
  memoryTimer = 0;
function stopMemoryTimer() {
  (memoryTimer && clearInterval(memoryTimer), (memoryTimer = 0));
}
function startMemoryTimer() {
  !window.triMemoryEnabled ||
    document.hidden ||
    memoryTimer ||
    (call("memory"), (memoryTimer = setInterval(() => call("memory"), 1e3)));
}
function memoryToggle(e) {
  queueMicrotask(() => window.triSyncHistory?.());
  ((el("memory-panel").hidden = !e),
    e &&
      !window.triMemoryEnabled &&
      ((window.triMemoryEnabled = !0),
      (el("memory-pause").textContent = "Pause"),
      startMemoryTimer()));
}
function memoryRestart() {
  ((memorySamples = []), (memoryBaseline = null), (memoryPeak = 0));
  for (const e of ["capacity", "allocated", "free", "peak", "delta", "static"])
    el("mem-" + e).textContent = "—";
  ((el("mem-count").textContent = "0"), (el("memory-export").disabled = !0));
}
((window.triMemorySample = function (e) {
  if (!window.triMemoryEnabled) return;
  ((e.frames = drawCount),
    null === memoryBaseline && (memoryBaseline = e.allocated),
    (memoryPeak = Math.max(memoryPeak, e.allocated)),
    memorySamples.push(e),
    memorySamples.length > 600 && memorySamples.shift());
  const t = {
    capacity: e.capacity,
    allocated: e.allocated,
    free: e.free_bytes,
    peak: memoryPeak,
    delta: e.allocated - memoryBaseline,
    static: e.game_static,
  };
  for (const [e, n] of Object.entries(t))
    el("mem-" + e).textContent = (n / 1048576).toFixed(3) + " MiB";
  ((el("mem-count").textContent = String(memorySamples.length)),
    (el("mem-frames").textContent = String(drawCount)),
    (el("memory-export").disabled = !1));
}),
  (el("memory").onclick = () => memoryToggle(el("memory-panel").hidden)),
  (el("memory-close").onclick = () => memoryToggle(!1)),
  (el("memory-reset").onclick = memoryRestart),
  (el("memory-pause").onclick = () => {
    ((window.triMemoryEnabled = !window.triMemoryEnabled),
      (el("memory-pause").textContent = window.triMemoryEnabled
        ? "Pause"
        : "Resume"),
      window.triMemoryEnabled ? startMemoryTimer() : stopMemoryTimer());
  }),
  (el("memory-export").onclick = () => {
    const e = [
        "seconds",
        "capacity",
        "allocated",
        "free_bytes",
        "game_static",
        "puzzle",
        "width",
        "height",
        "frames",
      ],
      t =
        e.join(",") +
        "\n" +
        memorySamples.map((t) => e.map((e) => t[e]).join(",")).join("\n"),
      n = URL.createObjectURL(new Blob([t], { type: "text/csv" })),
      r = document.createElement("a");
    ((r.href = n),
      (r.download = "tri-logic-memory.csv"),
      r.click(),
      setTimeout(() => URL.revokeObjectURL(n), 1e3));
  }));
var Module = {
  canvas: canvas,
  print: console.log,
  printErr: console.error,
  onAbort: (e) => {
    ((el("status").hidden = !0),
      (el("error").hidden = !1),
      (el("error").textContent = "The game could not start. " + e));
  },
};

canvas.addEventListener("webglcontextcreationerror", (event) => {
  el("status").hidden = true;
  el("error").hidden = false;
  el("error").textContent =
    "This browser could not start WebGL, which Delta Triplex needs to draw the puzzle. Try a browser with graphics acceleration enabled.";
  console.error("WebGL startup:", event.statusMessage);
});
