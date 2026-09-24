const assert = require("assert");
const { harness, source } = require("./test_rotation_harness.cjs");
(async () => {
  const h = harness(source), { d, w } = h;
  h.startPuzzle();
  const board = d.getElementById("rotate-board");
  assert(d.getElementById("bottom-controls").contains(d.getElementById("turn-controls")), "rotation buttons share the bottom controls row");
  assert(!d.getElementById("gesture-hint"));
  for (const id of ["turn-left", "turn-right"]) {
    assert.equal(d.getElementById(id).textContent.trim(), "");
    assert.equal(d.getElementById(id).querySelector("path").getAttribute("d"), d.getElementById("undo").querySelector("path").getAttribute("d"));
  }
  board.setPointerCapture = () => {};
  function pointer(type, target, x, y, id = 1, extra = {}) {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: id, pointerType: "touch", button: 0, ...extra });
    target.dispatchEvent(event); h.flush();
  }
  function tap(index, tool = 0) {
    const polygon = board.querySelector(`[data-cell="${index}"]`);
    pointer("pointerdown", polygon, 200, 200, 1, { button: tool });
    pointer("pointerup", board, 200, 200, 1, { button: tool });
  }
  const axes = () => new Set([...board.querySelectorAll("text[data-axis]")].map(e => Number(e.dataset.axis)));
  function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  function insideTriangle(p, verts) {
    const signs = [[verts[0], verts[1]], [verts[1], verts[2]], [verts[2], verts[0]]].map(([a, b]) => orient(a, b, p));
    return signs.every(v => v > 1) || signs.every(v => v < -1);
  }
  function unit(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  }
  function railSamples(rail) {
    const far = [Number(rail.dataset.farX), Number(rail.dataset.farY)];
    const near = [Number(rail.dataset.nearX), Number(rail.dataset.nearY)];
    const end = [Number(rail.dataset.endX), Number(rail.dataset.endY)];
    if (rail.dataset.style === "corner") return [far, near, [(near[0] + end[0]) / 2, (near[1] + end[1]) / 2]];
    const center = [Number(rail.dataset.cx), Number(rail.dataset.cy)];
    const radius = Number(rail.dataset.radius);
    const a0 = Math.atan2(near[1] - center[1], near[0] - center[0]);
    const a1 = Math.atan2(end[1] - center[1], end[0] - center[0]);
    let turn = a1 - a0;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    return [far, near, .35, .7].map((t, index) => index < 2 ? [far, near][index] : [
      center[0] + radius * Math.cos(a0 + turn * t), center[1] + radius * Math.sin(a0 + turn * t),
    ]);
  }
  function segmentsCross(a, b, c, d) {
    const ab = orient(a, b, c) * orient(a, b, d);
    const cd = orient(c, d, a) * orient(c, d, b);
    return ab < -1e-4 && cd < -1e-4;
  }
  function assertColumnClues(board, geometry, width, height, n, composition) {
    const rails = [...board.querySelectorAll("path[data-rail]")];
    assert.equal(rails.length, (n + 1) * 2, "neighboring columns share a line, and both ends of the row keep one");
    const cell = geometry.scale * 2 / n;
    const byRank = new Map();
    for (const label of board.querySelectorAll("text[data-column]")) {
      const key = `${label.dataset.side}:${label.dataset.axis}:${label.dataset.row}`;
      const list = byRank.get(key) || [];
      list.push(label);
      byRank.set(key, list);
    }
    assert.equal(byRank.size, n * 2, "one column for every rank on the two open edges");
    for (const list of byRank.values()) {
      list.sort((a, b) => Number(a.dataset.run) - Number(b.dataset.run));
      const xs = list.map(label => Number(label.getAttribute("x")));
      assert(Math.max(...xs) - Math.min(...xs) < 1e-6, "a column's numbers share one vertical line");
      const first = Number(list[0].getAttribute("y")), last = Number(list[list.length - 1].getAttribute("y"));
      const font = Number(list[0].getAttribute("font-size"));
      const pitchFont = font / 1.5;
      if (list[0].dataset.side === "above") assert(first >= last - 1e-6, "upper columns read from the outside down toward the board");
      else assert(first <= last + 1e-6, "lower columns read from the outside up toward the board");
      for (let i = 1; i < list.length; i++) {
        const step = Math.abs(Number(list[i].getAttribute("y")) - Number(list[i - 1].getAttribute("y")));
        assert(Math.abs(step - pitchFont * 1.12 * geometry.spread) < .75, "numerals in a column are spaced by the chosen spread");
      }
    }
    for (const side of ["above", "below"]) {
      const sideRails = rails.filter(rail => rail.dataset.side === side).sort((a, b) => Number(a.dataset.rail) - Number(b.dataset.rail));
      const columns = [...byRank.values()].filter(list => list[0].dataset.side === side)
        .sort((a, b) => Number(a[0].getAttribute("x")) - Number(b[0].getAttribute("x")));
      columns.forEach((list, index) => {
        const x = Number(list[0].getAttribute("x"));
        const left = Number(sideRails[index].dataset.farX), right = Number(sideRails[index + 1].dataset.farX);
        assert(x > left + .4 && x < right - .4, "numerals sit in the open slot, to the right of the line that labels them");
        const mid = (Number(sideRails[index].dataset.endX) + Number(sideRails[index + 1].dataset.endX)) / 2;
        assert(x > mid + cell * .15, "the turn shifts numerals to the right of the rank");
        const ends = [Number(sideRails[index].dataset.endY), Number(sideRails[index + 1].dataset.endY)];
        const cornerY = side === "above" ? Math.min(...ends) : Math.max(...ends);
        const font = Number(list[0].getAttribute("font-size"));
        const pitchFont = font / 1.5;
        const rise = cell * .8 * (sideRails[index].dataset.style === "corner" ? 1 / (2 * Math.sqrt(3)) : Math.sqrt(3) / 2);
        const sign = side === "above" ? -1 : 1;
        const expected = cornerY + sign * (rise + Math.max(4, pitchFont * .42) + pitchFont * 1.12 * .5);
        assert(Math.abs(Number(list[0].getAttribute("y")) - expected) < 1.25, "the inner numeral meets the outer bordering corner");
        const toward = Number(list[0].getAttribute("y")) - sign * font / 2;
        assert(!insideTriangle([x, toward], geometry.outer), "column numerals stay outside the grid");
      });
    }
    for (const rail of rails) {
      const far = [Number(rail.dataset.farX), Number(rail.dataset.farY)];
      const near = [Number(rail.dataset.nearX), Number(rail.dataset.nearY)];
      const end = [Number(rail.dataset.endX), Number(rail.dataset.endY)];
      composition.push(far);
      const pad = width >= 900 ? 23.99 : 7.99;
      assert(far[0] >= pad && far[0] <= width - pad && far[1] >= pad && far[1] <= height - pad, "column line stays inside the viewport");
      assert(far[0] > end[0] + cell * .15, "vertical line sits to the right of the vertex it meets");
      if (rail.dataset.style === "curve") {
        assert(Math.abs(Number(rail.dataset.radius) - cell * .8) < .75, "curve radius is 80% of a cell");
        const radius = [end[0] - Number(rail.dataset.cx), end[1] - Number(rail.dataset.cy)];
        const dot = radius[0] * Number(rail.dataset.directionX) + radius[1] * Number(rail.dataset.directionY);
        assert(Math.abs(dot) < cell * .05, "the arc arrives along the rank, 60° from vertical");
        const sweep = /A [\d.eE+-]+ [\d.eE+-]+ 0 0 ([01])/.exec(rail.getAttribute("d"))[1];
        let turn = Math.atan2(end[1] - Number(rail.dataset.cy), end[0] - Number(rail.dataset.cx))
          - Math.atan2(near[1] - Number(rail.dataset.cy), near[0] - Number(rail.dataset.cx));
        while (turn <= -Math.PI) turn += 2 * Math.PI;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        assert.equal(sweep, turn > 0 ? "1" : "0", "the arc bends along the row, not around the point");
      } else {
        const dot = unit(far, near)[0] * unit(near, end)[0] + unit(far, near)[1] * unit(near, end)[1];
        assert(Math.abs(dot - .5) < .03, "the corner is a single 120° joint");
      }
      for (const point of railSamples(rail)) assert(!insideTriangle(point, geometry.outer), "column lines do not cut through the grid");
      const id = /url\(#([^)]+)\)/.exec(rail.getAttribute("stroke"))[1];
      const stops = [...board.querySelector(`#${id}`).querySelectorAll("stop")];
      assert.deepEqual(stops.map(stop => stop.getAttribute("stop-opacity")), ["0", "1", "1"], "column lines fade in toward the triangle");
      const span = Math.abs(Number(rail.dataset.farY) - Number(rail.dataset.nearY)) || 1;
      const pitch = Number(board.querySelector(`text[data-column][data-side="${rail.dataset.side}"]`).getAttribute("font-size")) / 1.5;
      const solidAt = Number(stops[1].getAttribute("offset"));
      assert(Math.abs(solidAt - Math.min(.8, pitch * 1.24 / span)) < 1e-4, "the fade is twice as long and starts closer to the triangle");
      assert(solidAt > Math.min(.8, pitch * .62 / span) + 1e-4, "dimming begins closer to the triangle than the short ramp");
    }
    const polylines = rails.map(rail => [...railSamples(rail), [Number(rail.dataset.endX), Number(rail.dataset.endY)]]);
    for (let i = 0; i < polylines.length; i++) for (let j = i + 1; j < polylines.length; j++) {
      if (rails[i].dataset.side !== rails[j].dataset.side) continue;
      for (let a = 0; a < polylines[i].length - 1; a++) for (let b = 0; b < polylines[j].length - 1; b++)
        assert(!segmentsCross(polylines[i][a], polylines[i][a + 1], polylines[j][b], polylines[j][b + 1]), "column lines do not cross");
    }
  }
  function assertAnchor() {
    const g = w.TriRotation.geometry;
    for (const axis of [0, 1]) assert(Math.abs(g.outer.reduce((sum, p) => sum + p[axis], 0) / 3 - g.center[axis]) < 1e-6);
  }
  const observed = new Set();
  for (let i = 0; i < 3; i++) {
    assert.equal(axes().size, 2);
    axes().forEach(a => observed.add(a));
    assertAnchor();
    h.click("turn-right");
  }
  assert.equal(observed.size, 3);
  assert.equal(w.TriRotation.stats.view, 0);
  assert.equal(w.TriRotation.stats.turns, 3);
  tap(0); assert.equal(h.state.cells[0].state, 1);
  tap(0); assert.equal(h.state.cells[0].state, 2);
  tap(0); assert.equal(h.state.cells[0].state, 0);
  h.click("turn-right"); tap(0); assert.equal(h.state.cells[0].state, 1, "turning keeps cell identity");
  h.click("undo"); assert.equal(h.state.cells[0].state, 0);
  assert.equal(w.TriRotation.stats.turns, 4, "undo does not erase rotations");
  const cellBefore = JSON.stringify(h.state.cells);
  pointer("pointerdown", board.querySelector("polygon"), 200, 200);
  pointer("pointermove", board, 300, 200);
  pointer("pointerup", board, 300, 200);
  assert.equal(w.TriRotation.stats.turns, 5);
  assert.equal(JSON.stringify(h.state.cells), cellBefore, "swipe never paints");
  pointer("pointerdown", board.querySelector("polygon"), 200, 200);
  pointer("pointerdown", board, 300, 200, 2);
  pointer("pointermove", board, 150, 286.60254, 2);
  pointer("pointerup", board, 150, 286.60254, 2);
  pointer("pointerup", board, 200, 200);
  assert.equal(w.TriRotation.stats.turns, 6, "120-degree twist is one rotation");
  assert.equal(JSON.stringify(h.state.cells), cellBefore, "twist never paints");
  pointer("pointerdown", board.querySelector("polygon"), 200, 200);
  pointer("pointercancel", board, 200, 200);
  assert.equal(JSON.stringify(h.state.cells), cellBefore, "cancelled tap never paints");
  board.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true })); h.flush();
  assert.equal(w.TriRotation.stats.turns, 7);
  board.dispatchEvent(new w.WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true })); h.flush();
  assert.equal(w.TriRotation.stats.turns, 7, "wheel momentum is throttled");
  h.advance(65000);
  assert.equal(w.TriRotation.formatTime(w.TriRotation.stats.elapsed), "01:05");
  h.click("menu-toggle"); h.advance(30000);
  assert.equal(w.TriRotation.formatTime(w.TriRotation.stats.elapsed), "01:05", "menus pause timing");
  h.click("menu-close");
  tap(0);
  const storage = Object.fromEntries(Array.from({length: w.localStorage.length}, (_, i) => {
    const key = w.localStorage.key(i); return [key, w.localStorage.getItem(key)];
  }));
  const resumed = harness(source, "https://tri.test/#level=0", storage);
  assert.equal(resumed.state.cells[0].state, 1, "saved cells reload with the timer");
  assert.equal(resumed.w.TriRotation.stats.elapsed, 65000, "resuming saved progress preserves time");
  assert.equal(resumed.w.TriRotation.stats.turns, 7, "resuming saved progress preserves turn count");
  resumed.close(); tap(0); tap(0);
  for (let t = 0; t < h.state.cells.length; t++) {
    const c = h.state.cells[t], row = c.i + c.j + c.o, id = row * row + 2 * c.i + c.o;
    if (c.active && h.state.solution[id]) tap(t);
  }
  assert(h.state.won);
  assert.equal(d.getElementById("solve-result").textContent, "Solved: 01:05 / 7 rotations");
  h.advance(120000);
  assert.equal(w.TriRotation.stats.finished.elapsed, 65000);
  h.click("share-result");
  await new Promise(resolve => setImmediate(resolve));
  assert(!d.getElementById("result-copy").hidden);
  assert(d.getElementById("result-text").value.includes("01:05 / 7 rotations"));
  assert(d.getElementById("result-text").value.includes("https://delta.theologi.ca/#level=0"));
  let shared;
  w.navigator.share = async data => { shared = data; };
  h.click("share-result"); await Promise.resolve();
  assert.equal(shared.text, "Delta Triplex — Solved: 01:05 / 7 rotations");
  assert.equal(shared.url, "https://delta.theologi.ca/#level=0");
  const linked = harness(source, "https://tri.test/#level=2");
  assert.equal(linked.state.level, 2); linked.close();
  h.click("undo"); assert(!h.state.won); assert.equal(axes().size, 2);
  h.click("reset"); assert.equal(w.TriRotation.stats.turns, 0); assert.equal(w.TriRotation.stats.elapsed, 0);
  // Undoing a reset brings back the time and turns it cleared, on top of play since.
  const beforeReset = JSON.stringify(h.state.cells.map(c => c.state));
  h.click("undo"); h.click("undo");
  assert.equal(w.TriRotation.stats.elapsed, 65000); assert.equal(w.TriRotation.stats.turns, 7);
  h.click("reset"); h.advance(4000); tap(0);
  assert.equal(w.TriRotation.stats.elapsed, 4000, "reset restarts the stopwatch");
  h.click("reset"); h.advance(2000);
  h.click("undo"); assert.equal(w.TriRotation.stats.elapsed, 6000, "undoing the second reset restores its time");
  h.click("undo"); assert.equal(w.TriRotation.stats.elapsed, 6000, "undoing a stroke leaves the time alone");
  h.click("undo"); assert.equal(w.TriRotation.stats.elapsed, 71000, "undoing the first reset restores its time");
  assert.equal(w.TriRotation.stats.turns, 7);
  assert.notEqual(JSON.stringify(h.state.cells.map(c => c.state)), beforeReset);
  h.click("reset"); assert.equal(w.TriRotation.stats.elapsed, 0);
  for (let difficulty = 0; difficulty < 5; difficulty++) {
    h.click("return-home"); h.click("endless-mode");
    d.querySelector(`#difficulties button[data-difficulty="${difficulty}"]`).click();
    await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === difficulty);
    assert.equal(h.state.n, [4, 6, 8, 10, 3][difficulty]);
    h.click("editor-json"); const puzzle = JSON.parse(await h.download());
    assert.equal(puzzle.orientation, 0, "generated puzzles face the default way");
    assert.equal(d.getElementById("session-seed").textContent, "Code " + w.TriShare.seedCode(puzzle.seed, puzzle.difficulty));
    assert(d.getElementById("session-seed").title.includes(puzzle.seed.toString(16).toUpperCase().padStart(8, "0")));
    const code = w.TriShare.seedCode(puzzle.seed, puzzle.difficulty);
    assert.deepEqual(w.TriShare.seedPuzzle(code).solution, puzzle.solution, "one code reproduces this difficulty and seed");
    const url = w.TriShare.url(puzzle); assert(url.includes("#seed=") && !url.includes("orientation") && !url.includes("difficulty"));
    const linkedSeed = harness(source, url);
    assert.deepEqual(linkedSeed.state.solution, h.state.solution);
    assert.equal(linkedSeed.w.TriRotation.stats.view, 0); linkedSeed.close();
    const packed = w.TriShare.decode(w.TriShare.encode(puzzle));
    assert.equal(packed.orientation, 0); assert.deepEqual(packed.solution, puzzle.solution);
    h.click("editor-export");
    const standalone = harness(await h.download());
    assert.deepEqual(standalone.state.solution, h.state.solution);
    assert(standalone.d.getElementById("rotate-board"));
    standalone.close();
    // All sizes have only two clue axes; every number remains inside the drawing area.
    h.flush(); assert.equal(axes().size, 2);
    for (const [width, height] of [[1440, 760], [900, 760], [390, 760], [412, 900], [390, 480], [320, 360], [800, 240]]) {
      h.resize(width, height);
      const composition = [];
      for (let turn = 0; turn < 3; turn++) {
        const geometry = w.TriRotation.geometry;
        composition.push(...geometry.outer);
        assert.equal(axes().size, 2);
        assertAnchor();
        if (!geometry.desktop && height >= width) {
          assert(geometry.columns, "a portrait phone stacks clues for every difficulty");
          if (width === 390 && height === 760 && h.state.n >= 6)
            assert(geometry.scale * 2 / h.state.n >= 34, "portrait cells stay large enough to tap");
        }
        const labels = [...board.querySelectorAll("text[data-axis]")];
        for (const label of labels) {
          const x = Number(label.getAttribute("x")), y = Number(label.getAttribute("y"));
          assert(Number(label.dataset[geometry.desktop ? "directionY" : "directionX"]) > 0, "both clue sides lead inward toward the bare edge");
          assert.equal(label.getAttribute("fill"), "var(--cell)");
          const font = Number(label.getAttribute("font-size"));
          const pad = width >= 900 ? 23.99 : 7.99;
          if (geometry.columns) {
            assert.equal(label.dataset.column, "1");
            assert.equal(label.getAttribute("text-anchor"), "middle");
            assert.equal(label.getAttribute("dominant-baseline"), "central");
            const half = font * .72 * label.textContent.length / 2;
            composition.push([x - half, y - font / 2], [x + half, y + font / 2]);
            assert(x - half >= pad && x + half <= width - pad && y - font / 2 >= pad && y + font / 2 <= height - pad, `column clue inside ${width}×${height} viewport`);
          } else {
            const dx = x - Number(label.dataset.centerX), dy = y - Number(label.dataset.centerY);
            assert(Math.abs(dx * Number(label.dataset.directionY) - dy * Number(label.dataset.directionX)) < 1e-6, "clue aligned with end-cell centroid");
            const desktop = geometry.desktop;
            const right = desktop && Number(label.dataset.directionX) < 0;
            const top = !desktop && Number(label.dataset.directionY) > 0;
            assert.equal(label.getAttribute("text-anchor"), right ? "end" : "start");
            assert.equal(label.getAttribute("dominant-baseline"), top ? "text-before-edge" : "text-after-edge");
            const textWidth = font * .72 * label.textContent.length;
            const left = x - (right ? textWidth : 0), bottom = y + (top ? font : 0);
            composition.push([left, bottom - font], [left + textWidth, bottom]);
            assert(left >= pad && left + textWidth <= width - pad && bottom - font >= pad && bottom <= height - pad, `anchored clue inside ${width}×${height} viewport`);
          }
        }
        if (geometry.columns) assertColumnClues(board, geometry, width, height, h.state.n, composition);
        h.click("turn-right");
      }
      const spans = [0, 1].map(axis => {
        const low = Math.min(...composition.map(p => p[axis]));
        const high = Math.max(...composition.map(p => p[axis]));
        assert(Math.abs((low + high) / 2 - (axis ? height : width) / 2) < 1e-6, "triangle and all hints are centered together");
        return high - low;
      });
      const margin = (width >= 900 ? 24 : 8) * 2;
      assert(Math.abs(spans[0] - (width - margin)) < 1e-6 || Math.abs(spans[1] - (height - margin)) < 1e-6,
        "at least one dimension is fully used; enlarging would clip the triangle or a hint");
    }
    if (h.state.n === 10) {
      h.resize(390, 760);
      const select = d.getElementById("clue-style");
      const phoneClues = select.closest("label");
      assert.equal(phoneClues.hidden, false, "phone clue setting is available on a phone");
      assert.equal(select.value, "corner");
      assert.equal(board.querySelector("path[data-rail]").dataset.style, "corner");
      select.value = "curve";
      select.dispatchEvent(new w.Event("change"));
      h.flush();
      assert.equal(board.querySelector("path[data-rail]").dataset.style, "curve", "the menu switches phone clues to the curve");
      assertColumnClues(board, w.TriRotation.geometry, 390, 760, h.state.n, []);
      select.value = "corner";
      select.dispatchEvent(new w.Event("change"));
      h.flush();
      assert.equal(board.querySelector("path[data-rail]").dataset.style, "corner", "the menu switches phone clues back to the corner joint");
      assert.equal(w.localStorage.getItem("delta-triplex-clue-style"), "corner");
      h.resize(1440, 760);
      assert.equal(phoneClues.hidden, true, "phone clue setting is hidden on desktop");
      h.resize(390, 760);
    }
    h.resize(900, 760);
  }
  h.close();
  // Worst cases for stacked clues: every line alternates, so one column holds
  // ten runs. Short phones tighten the spacing only as far as needed.
  for (const [pattern, expected] of [[i => i % 2, [1.5, 2, 3]], [i => (i >> 1) % 2, [3, 3, 3]]]) {
    const url = w.TriShare.url({ format: "tri-logic", version: 2, cellOrder: "north-row-major", size: 10,
      solution: Array.from({ length: 100 }, (_, i) => pattern(i)) }).replace("https://delta.theologi.ca/", "https://tri.test/");
    const dense = harness(source, url), denseBoard = dense.d.getElementById("rotate-board");
    [[320, 360], [390, 480], [390, 760]].forEach(([width, height], index) => {
      dense.resize(width, height);
      const geometry = dense.w.TriRotation.geometry;
      assert(geometry.columns);
      assert.equal(geometry.spread, expected[index], `clue spread at ${width}×${height}`);
      assertColumnClues(denseBoard, geometry, width, height, 10, []);
      for (const label of denseBoard.querySelectorAll("text[data-axis]")) {
        const y = Number(label.getAttribute("y")), font = Number(label.getAttribute("font-size"));
        assert(y - font / 2 >= 7.99 && y + font / 2 <= height - 7.99, `dense clues stay inside ${width}×${height}`);
      }
    });
    dense.close();
  }
  console.log("PASS: real WASM rules, centered view, all clue sides, tap/swipe/twist/cancel/wheel, rotation counts, timing/pause/freeze/undo/reset, brag fallback, level links, five Endless difficulties, default-facing exports and seed links, tightened clue spacing on short phones.");
})().catch(error => { console.error(error); process.exit(1); });
