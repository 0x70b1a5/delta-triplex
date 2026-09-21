"use strict";
// Menu flash waves use shared-edge distance; the base theme stays monochrome.
(() => {
  const home = el("home");
  let hue = Math.random() * 360, elapsed = 0, previous = null, frame = 0;
  let pending = null, zoom = null;
  const scenes = [...home.querySelectorAll(".home-triangle")];
  const trigger = { endless: "endless-mode" };
  function cell(node, x, y, row) {
    node.classList.add("home-cell");
    node.style.setProperty("--x", x * 100 + "%");
    node.style.setProperty("--y", y * 100 + "%");
    node.dataset.row = row;
    // From the bottom tip, each row takes two shared-edge hops:
    // first its upward triangle, then the downward triangles beside it.
    node.dataset.wave = 2 * (+node.closest('.home-triangle').dataset.rows - 1 - row)
      - (node.classList.contains('home-up') ? 1 : 0);
    if (node.matches("button, a") && !node.querySelector(":scope > span")) {
      const span = document.createElement("span");
      while (node.firstChild) span.append(node.firstChild);
      node.append(span);
    }
  }
  function fitLabels(scene) {
    const width = scene.getBoundingClientRect().width;
    if (!width) return;
    for (const button of scene.querySelectorAll("button.home-cell, a.home-cell")) {
      let size = Math.max(9, Math.min(22, width / +scene.dataset.rows * .08));
      button.style.setProperty("--label-size", size + "px");
      const span = button.querySelector("span");
      for (let i = 0; i < 3 && span.clientWidth && span.scrollWidth > span.clientWidth; i++) {
        size *= span.clientWidth / span.scrollWidth;
        button.style.setProperty("--label-size", size + "px");
      }
    }
  }
  window.triHomeLayout = () => {
    for (const scene of scenes) {
      const buttons = [...scene.querySelectorAll("button:not(#home-back):not(#past-puzzles)")];
      let rows = 3;
      while (rows * (rows - 1) / 2 - 1 < buttons.length) rows++;
      scene.dataset.rows = rows;
      scene.style.setProperty("--rows", rows);
      scene.style.setProperty("--tip", 50 / rows + "%");
      scene.querySelector(".home-banner").dataset.row = 0;
      scene.querySelector(".home-banner").dataset.wave = 2 * rows - 3;
      scene.querySelectorAll(".home-filler").forEach(node => node.remove());
      let index = 0;
      for (let row = 1; row < rows - 1; row++) {
        for (let col = 0; col < rows - row; col++) {
          const x = (row / 2 + col) / rows;
          const button = buttons[index++];
          const down = button || document.createElement("i");
          if (!button) { down.className = "home-filler"; down.setAttribute("aria-hidden", "true"); scene.append(down); }
          cell(down, x, row / rows, row);
          if (col < rows - row - 1) {
            const up = scene.id === "home-main" && row === rows - 2 && col === 0 ? el("past-puzzles") : document.createElement("i");
            if (up.id !== "past-puzzles") { up.className = "home-filler home-up"; up.setAttribute("aria-hidden", "true"); }
            scene.append(up); cell(up, x + .5 / rows, row / rows, row);
          }
        }
      }
      const credit = scene.querySelector(".home-credit");
      if (credit) cell(credit, (rows - 1) / (2 * rows), (rows - 1) / rows, rows - 1);
      fitLabels(scene);
    }
    const view = home.dataset.view;
    if (view === "calendar") {
      const back = el("home-back");
      back.classList.add("home-cell", "home-back");
      if (!back.querySelector("span")) { const label = document.createElement("span"); label.textContent = back.textContent; back.replaceChildren(label); }
      el("calendar-back-slot").append(back);
    } else if (view !== "main") {
      const scene = el("home-" + view), rows = +scene.dataset.rows, back = el("home-back");
      back.classList.add("home-back"); if (back.parentElement !== scene) scene.append(back);
      cell(back, (rows - 1) / (2 * rows), (rows - 1) / rows, rows - 1);
      fitLabels(scene);
    }
  };
  function finishZoom() {
    if (!zoom) return;
    const { outgoing, incoming, parent, child } = zoom;
    for (const scene of [parent, child]) {
      for (const name of ["transform", "z-index", "opacity", "background", "clip-path"]) scene.style.removeProperty(name);
    }
    outgoing.hidden = true; outgoing.inert = false; incoming.inert = false;
    home.removeAttribute("data-transition"); zoom = null;
    if (!home.hidden) el(home.dataset.view === "main" ? "today-puzzle" : "home-back").focus({ preventScroll: true });
  }
  window.triHomePrepare = view => {
    finishZoom();
    const from = home.dataset.view;
    pending = from !== "calendar" && view !== "calendar" && !home.hidden && from !== view && (from === "main" || view === "main")
      ? { from, to: view, source: from === "main" ? el(trigger[view])?.getBoundingClientRect() : null } : null;
  };
  function startZoom() {
    const change = pending; pending = null;
    if (!change || !motionEnabled || home.hidden) return;
    const outgoing = el("home-" + change.from), incoming = el("home-" + change.to);
    const forward = change.from === "main";
    const parent = el("home-main"), child = forward ? incoming : outgoing;
    outgoing.hidden = false;
    const rect = child.getBoundingClientRect(), parentRect = parent.getBoundingClientRect();
    const source = forward ? change.source : el(trigger[change.from]).getBoundingClientRect();
    if (!rect.width || !rect.height || !source?.width || !source.height) { outgoing.hidden = true; return; }
    outgoing.inert = incoming.inert = true;
    parent.style.zIndex = "1"; child.style.zIndex = "2";
    parent.style.opacity = child.style.opacity = "1";
    // The nested menu is opaque from the first frame. Its triangle-shaped
    // backing also covers the old button label beneath the new cell gaps.
    child.style.background = "var(--bg)";
    child.style.clipPath = "polygon(0 0, 100% 0, 50% 100%)";
    // One camera move: the whole parent enlarges around the selected cell.
    // Its embedded child stays registered to that cell throughout the move.
    const sx = rect.width / source.width, sy = rect.height / source.height;
    zoom = { outgoing, incoming, parent, child, forward, start: performance.now(),
      x: source.left - rect.left, y: source.top - rect.top, sx, sy,
      px: rect.left - parentRect.left - (source.left - parentRect.left) * sx,
      py: rect.top - parentRect.top - (source.top - parentRect.top) * sy };
    home.dataset.transition = forward ? "in" : "out";
    drawZoom(performance.now());
  }
  function drawZoom(now) {
    if (!zoom) return;
    const t = Math.min(1, Math.max(0, (now - zoom.start) / 360));
    const eased = t * t * (3 - 2 * t);
    const k = zoom.forward ? eased : 1 - eased;
    const { parent, child, x, y, sx, sy, px, py } = zoom;
    parent.style.transform = `translateX(-50%) translate(${px * k}px, ${py * k}px) scale(${1 + (sx - 1) * k}, ${1 + (sy - 1) * k})`;
    child.style.transform = `translateX(-50%) translate(${x * (1 - k)}px, ${y * (1 - k)}px) scale(${(1 + (sx - 1) * k) / sx}, ${(1 + (sy - 1) * k) / sy})`;
    if (t === 1) finishZoom();
  }
  function flash() {
    for (const scene of scenes) {
      const rows = +scene.dataset.rows;
      const step = elapsed * 2;
      const wave = Math.floor(step) % (2 * rows - 2);
      const glow = motionEnabled && !home.hidden ? .18 + .12 * Math.cos((step % 1) * Math.PI) : 0;
      const theme = home.style;
      for (const cell of scene.querySelectorAll("[data-row]")) {
        const active = +cell.dataset.wave === wave && glow > 0;
        const banner = cell.classList.contains("home-banner");
        cell.style.setProperty("--row-glow", active ? glow : 0);
        if (active) {
          const fill = TriPalette.flash(theme.getPropertyValue(banner ? "--cell" : cell.classList.contains("home-up") ? "--home-dim" : "--empty"), Math.floor(step), glow, themeMode);
          cell.style.setProperty("--flash-fill", fill);
          cell.style.setProperty("--row-ink", TriPalette.ink(fill));
        } else {
          cell.style.removeProperty("--flash-fill");
          cell.style.removeProperty("--row-ink");
        }
      }
    }
  }
  function paint() {
    writeTheme(home, currentTheme(themeMode === "colorful" ? {
      bg: TriPalette.oklch(.22, .04, hue), cell: TriPalette.oklch(.91, .11, hue + 145),
    } : undefined));
    // Crossed cells are 50% empty over background; upward menu cells use half that intensity.
    const dim = TriPalette.mix(home.style.getPropertyValue("--bg"), home.style.getPropertyValue("--empty"), .25);
    home.style.setProperty("--home-dim", dim);
    home.style.setProperty("--home-dim-ink", TriPalette.ink(dim));
  }
  function tick(now) {
    frame = 0;
    if (home.hidden || document.hidden || !motionEnabled) { previous = null; return; }
    if (previous !== null) {
      const dt = Math.min(100, Math.max(0, now - previous)) / 1000;
      elapsed += dt;
      if (themeMode === "colorful") {
        hue = (hue + (2 + .65 * Math.sin(elapsed / 17) + .3 * Math.sin(elapsed / 7)) * dt) % 360;
        paint();
      }
    }
    previous = now;
    flash(); drawZoom(now);
    frame = requestAnimationFrame(tick);
  }
  window.triHomeChanged = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = null;
    if (home.hidden || document.hidden || !motionEnabled) finishZoom();
    if (!home.hidden) { window.triHomeLayout(); startZoom(); }
    paint(); flash();
    if (!home.hidden && !document.hidden && motionEnabled) frame = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", window.triHomeChanged);
  motionPreference?.addEventListener("change", window.triHomeChanged);
  window.addEventListener("resize", () => { finishZoom(); window.triHomeLayout(); });
  document.fonts?.ready.then(() => scenes.forEach(fitLabels));
  window.triHomeChanged();
})();
