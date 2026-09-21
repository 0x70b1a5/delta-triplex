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
  for (let difficulty = 0; difficulty < 5; difficulty++) {
    h.click("return-home"); h.click("endless-mode");
    d.querySelector(`#difficulties button[data-difficulty="${difficulty}"]`).click();
    await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === difficulty);
    assert.equal(h.state.n, [4, 6, 8, 10, 3][difficulty]);
    h.click("editor-json"); const puzzle = JSON.parse(await h.download());
    assert(!("orientation" in puzzle), "export omits orientation");
    assert.equal(d.getElementById("session-seed").textContent, "Code " + w.TriShare.seedCode(puzzle.seed, puzzle.difficulty));
    assert(d.getElementById("session-seed").title.includes(puzzle.seed.toString(16).toUpperCase().padStart(8, "0")));
    const code = w.TriShare.seedCode(puzzle.seed, puzzle.difficulty);
    assert.deepEqual(w.TriShare.seedPuzzle(code).solution, puzzle.solution, "one code reproduces this difficulty and seed");
    const url = w.TriShare.url(puzzle); assert(!url.includes("orientation") && !url.includes("difficulty"));
    const linkedSeed = harness(source, url);
    assert.deepEqual(linkedSeed.state.solution, h.state.solution);
    assert.equal(linkedSeed.w.TriRotation.stats.view, 0); linkedSeed.close();
    const packed = w.TriShare.decode(w.TriShare.encode(puzzle));
    assert(!("orientation" in packed)); assert.deepEqual(packed.solution, puzzle.solution);
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
        composition.push(...w.TriRotation.geometry.outer);
        assert.equal(axes().size, 2);
        assertAnchor();
        for (const label of board.querySelectorAll("text[data-axis]")) {
          const x = Number(label.getAttribute("x")), y = Number(label.getAttribute("y"));
          const dx = x - Number(label.dataset.centerX), dy = y - Number(label.dataset.centerY);
          assert(Math.abs(dx * Number(label.dataset.directionY) - dy * Number(label.dataset.directionX)) < 1e-6, "clue aligned with end-cell centroid");
          assert(Number(label.dataset[w.TriRotation.geometry.desktop ? "directionY" : "directionX"]) > 0, "both clue sides lead inward toward the bare edge");
          assert.equal(label.getAttribute("fill"), "var(--cell)");
          const desktop = w.TriRotation.geometry.desktop;
          const right = desktop && Number(label.dataset.directionX) < 0;
          const top = !desktop && Number(label.dataset.directionY) > 0;
          assert.equal(label.getAttribute("text-anchor"), right ? "end" : "start");
          assert.equal(label.getAttribute("dominant-baseline"), top ? "text-before-edge" : "text-after-edge");
          const font = Number(label.getAttribute("font-size")), textWidth = font * .72 * label.textContent.length;
          const left = x - (right ? textWidth : 0), bottom = y + (top ? font : 0);
          composition.push([left, bottom - font], [left + textWidth, bottom]);
          assert(left >= 11.99 && left + textWidth <= width - 11.99 && bottom - font >= 11.99 && bottom <= height - 11.99, `anchored clue inside ${width}×${height} viewport`);
        }
        h.click("turn-right");
      }
      const spans = [0, 1].map(axis => {
        const low = Math.min(...composition.map(p => p[axis]));
        const high = Math.max(...composition.map(p => p[axis]));
        assert(Math.abs((low + high) / 2 - (axis ? height : width) / 2) < 1e-6, "triangle and all hints are centered together");
        return high - low;
      });
      assert(Math.abs(spans[0] - (width - 48)) < 1e-6 || Math.abs(spans[1] - (height - 48)) < 1e-6,
        "at least one dimension is fully used; enlarging would clip the triangle or a hint");
    }
    h.resize(900, 760);
  }
  h.close();
  console.log("PASS: real WASM rules, centered view, all clue sides, tap/swipe/twist/cancel/wheel, rotation counts, timing/pause/freeze/undo/reset, brag fallback, level links, five Endless difficulties, orientation-free exports and seed links.");
})().catch(error => { console.error(error); process.exit(1); });
