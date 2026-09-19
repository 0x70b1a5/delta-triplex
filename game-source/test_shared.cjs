const { JSDOM } = require("jsdom");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert");
const source = fs.readFileSync(
  path.join(
    __dirname,
    fs.existsSync(path.join(__dirname, "web/index.html"))
      ? "web/index.html"
      : "../public/game.html",
  ),
  "utf8",
);
function harness(html, url = "https://tri.test/", storage = {}) {
  const dom = new JSDOM(html, {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url,
    }),
    w = dom.window,
    d = w.document;
  for (const [key, value] of Object.entries(storage))
    w.localStorage.setItem(key, value);
  const timers = new Map(),
    frames = new Map();
  let seq = 0;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.ResizeObserver = class {
    observe() {}
  };
  w.requestAnimationFrame = (fn) => {
    const id = ++seq;
    frames.set(id, fn);
    return id;
  };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, ms });
    return id;
  };
  w.clearTimeout = (id) => timers.delete(id);
  w.confirm = () => true;
  w.innerWidth = 800;
  const rect = () => ({
    left: 0,
    top: 0,
    width: 900,
    height: 760,
    right: 900,
    bottom: 760,
  });
  d.getElementById("stage").getBoundingClientRect = rect;
  const canvas = d.getElementById("canvas");
  canvas.getBoundingClientRect = rect;
  canvas.setPointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  const scripts = [...d.scripts].filter((s) => s.type !== "application/json");
  const engine = scripts.find((s) => s.textContent.includes("AGFzb"));
  assert(engine, "embedded WASM engine is present");
  const wasm = new WebAssembly.Module(
    Buffer.from(engine.textContent.match(/AGFzb[A-Za-z0-9+/=]+/)[0], "base64"),
  );
  const imports = {};
  for (const entry of WebAssembly.Module.imports(wasm)) {
    imports[entry.module] ??= {};
    imports[entry.module][entry.name] = () => 0;
  }
  let exports, latest;
  const decode = (ptr) => {
    const bytes = new Uint8Array(exports.memory.buffer);
    return new TextDecoder().decode(bytes.subarray(ptr, bytes.indexOf(0, ptr)));
  };
  imports.env.deliver_state = (ptr) => {
    latest = JSON.parse(decode(ptr));
    w.triState(latest);
  };
  imports.env.store_text = (key, value) =>
    w.localStorage.setItem(decode(key), decode(value));
  exports = new WebAssembly.Instance(wasm, imports).exports;
  exports.__wasm_call_ctors();
  const bridge = {};
  for (const [key, value] of Object.entries(exports))
    if (key.startsWith("game_")) bridge["_" + key] = value;
  // Rendering is the only stub: all board/rule/input/effect functions run real WASM.
  bridge._game_render = () => {};
  bridge.ccall = (name, ret, types, args) => {
    let ptr;
    const actual = args.map((arg, i) => {
      if (types[i] !== "string") return arg;
      const bytes = new TextEncoder().encode(arg + "\0");
      ptr = exports.malloc(bytes.length);
      new Uint8Array(exports.memory.buffer).set(bytes, ptr);
      return ptr;
    });
    try {
      const value = exports[name](...actual);
      return ret === "string" ? decode(value) : value;
    } finally {
      if (ptr) exports.free(ptr);
    }
  };
  w.__bridge = bridge;
  w.eval(
    scripts
      .filter((s) => s !== engine)
      .map((s) => s.textContent)
      .join("\n") + "\nObject.assign(Module,window.__bridge);",
  );
  exports.game_replay();
  w.triReady();
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  flush();
  function tapTip() {
    const n = latest.n,
      dir = latest.orientation,
      half =
        dir % 2
          ? Math.min((760 - 96) / 2, (900 - 144) / Math.sqrt(3))
          : Math.min((900 - 96) / 2, (760 - 144) / Math.sqrt(3));
    let x = 0,
      y = (half * Math.sqrt(3)) / 2 - (2 * half * Math.sqrt(3)) / (3 * n);
    if (dir === 1) [x, y] = [y, -x];
    else if (dir === 2) [x, y] = [-x, -y];
    else if (dir === 3) [x, y] = [-y, x];
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        pointerType: "touch",
        button: 0,
        clientX: 450 + x,
        clientY: 380 + y,
      });
      canvas.dispatchEvent(event);
    }
    flush();
  }
  let downloaded;
  w.URL.createObjectURL = (blob) => {
    downloaded = blob;
    return "blob:test";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  const download = async () =>
    new Promise((resolve) => {
      const reader = new w.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(downloaded);
    });
  return {
    w,
    d,
    exports,
    frames,
    timers,
    flush,
    settle: async (done) => {
      for (let step = 0; step < 1000; step++) {
        for (const [id, timer] of [...timers])
          if (timer.ms === 0) {
            timers.delete(id);
            timer.fn();
          }
        await new Promise((resolve) => setImmediate(resolve));
        flush();
        if (done()) return;
      }
      throw Error("Timed out waiting for generation");
    },
    tapTip,
    download,
    get state() {
      return latest;
    },
    click: (id) => {
      d.getElementById(id).click();
      flush();
    },
    close: () => w.close(),
  };
}
(async () => {
  const h = harness(source);
  const { d, w } = h;
  assert.equal(d.title, "Delta Triplex");
  assert(
    d
      .getElementById("bottom-controls")
      .contains(d.getElementById("editor-configure")),
  );
  assert(
    d.getElementById("bottom-controls").contains(d.getElementById("undo")),
  );
  assert(
    d.getElementById("puzzle-menu").contains(d.getElementById("controls-hint")),
  );
  for (let size = 2; size <= 10; size++)
    for (const orientation of ["S", "E", "N", "W"]) {
      const puzzle = {
        size,
        orientation,
        solution: Array.from({ length: size * size }, (_, i) =>
          i % 3 === 0 ? 1 : 0,
        ),
      };
      const code = w.TriShare.encode(puzzle),
        decoded = w.TriShare.decode(code);
      assert.equal(decoded.size, size);
      assert.equal(decoded.orientation, orientation);
      assert.deepEqual(Array.from(decoded.solution), puzzle.solution);
      assert(code.length <= 22);
    }
  assert.throws(() => w.TriShare.decode("bad!"));
  const customCode = w.TriShare.encode({
    size: 2,
    orientation: "E",
    solution: [1, 0, 0, 0],
  });
  const shared = harness(source, "https://tri.test/#p=" + customCode);
  assert(shared.state.custom && shared.state.orientation === 1);
  shared.tapTip();
  assert(shared.state.won);
  shared.close();
  const invalid = harness(
    source,
    "https://tri.test/#seed=nope&difficulty=easy",
  );
  assert(!invalid.d.getElementById("load-error").hidden);
  invalid.close();
  assert(!d.getElementById("home").hidden);
  h.click("select-level");
  assert.equal(d.querySelectorAll("#level-grid button").length, 4);
  h.click("home-back");
  h.click("endless-mode");
  d.querySelector("#difficulties button").click();
  assert.equal(
    d.getElementById("difficulties").getAttribute("aria-busy"),
    "true",
  );
  h.click("home-back");
  h.click("menu-toggle");
  h.click("level-1");
  assert.equal(h.state.level, 1);
  assert.equal(h.state.tutorial, -1);
  h.tapTip();
  const progress = w.localStorage.getItem("tri-logic-v1");
  assert.equal(progress[1 + 64], "1");
  h.click("menu-toggle");
  h.click("editor-open");
  assert(h.state.custom && h.state.editing);
  assert.equal(d.querySelectorAll("canvas").length, 1);
  assert(!d.querySelector("#editor-board"));
  assert(!d.querySelector("#editor-clues"));
  assert.equal(h.state.solution[0], 0);
  h.tapTip();
  assert.equal(h.state.solution[0], 1);
  assert.equal(
    JSON.parse(w.localStorage.getItem("tri-logic-editor")).solution[0],
    1,
  );
  h.click("clue-2-2");
  assert.equal(h.state.axis, 2);
  assert.equal(h.state.row, 2);
  assert.equal(
    d.getElementById("clue-2-2").getAttribute("aria-pressed"),
    "true",
  );
  const label = d.getElementById("strip-label");
  assert(label.textContent.startsWith("→"));
  assert(Number.isFinite(parseFloat(label.style.left)));
  h.click("editor-test");
  assert(!h.state.editing && h.state.custom);
  assert.equal(h.state.row, 2);
  assert.equal(h.state.axis, 2);
  h.click("clue-0-1");
  assert.equal(h.state.axis, 0);
  assert.equal(h.state.row, 1);
  assert(label.textContent.startsWith("↙"));
  h.tapTip();
  assert(h.state.won);
  assert.equal(d.getElementById("clues").style.visibility, "hidden");
  assert(!d.getElementById("completion").hidden);
  h.click("next-puzzle");
  assert(h.state.editing);
  assert.equal(d.getElementById("clues").style.visibility, "");
  assert(h.state.editing);
  assert.equal(h.state.solution[0], 1);
  h.click("undo");
  assert.equal(h.state.solution[0], 0);
  h.tapTip();
  for (const direction of ["N", "E", "S", "W"]) {
    const select = d.getElementById("editor-orientation");
    select.value = direction;
    select.dispatchEvent(new w.Event("change"));
    h.flush();
    assert.equal(h.state.orientation, ["S", "E", "N", "W"].indexOf(direction));
    h.click("clue-1-2");
    assert.equal(h.state.axis, 1);
    assert.equal(h.state.row, 2);
    h.click("editor-json");
    const json = JSON.parse(await h.download());
    assert.equal(json.orientation, direction);
    assert.equal(json.solution[0], 1);
    h.click("editor-export");
    const html = await h.download();
    const ex = harness(html);
    assert(ex.state.custom && !ex.state.editing);
    assert.equal(ex.state.orientation, h.state.orientation);
    assert.deepEqual(
      ex.state.clues.map((a) => a.map((l) => l.runs)),
      h.state.clues.map((a) => a.map((l) => l.runs)),
    );
    assert.equal(ex.d.querySelectorAll("canvas").length, 1);
    assert.equal(ex.d.querySelectorAll("#level-0").length, 1);
    ex.click("clue-2-3");
    assert.equal(ex.state.axis, 2);
    assert.equal(ex.state.row, 3);
    ex.tapTip();
    assert(ex.state.won);
    ex.close();
  }
  h.click("editor-close");
  assert(!h.state.custom);
  assert.equal(h.state.level, 1);
  assert.equal(w.localStorage.getItem("tri-logic-v1"), progress);
  h.exports.game_clear_effects();
  h.flush();
  h.flush();
  assert.equal(h.frames.size, 0);
  console.log(
    "PASS: one shared canvas/clue matrix; real WASM authoring, trial play, clue highlighting, selection retention, pointer input, undo, draft persistence, all orientation exports, and built-in save isolation.",
  );
  // Load validates JSON before touching the running engine.
  const fileInput = d.getElementById("puzzle-file");
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [{ size: 10, text: async () => "{bad" }],
  });
  await fileInput.onchange();
  assert(!d.getElementById("load-error").hidden);
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [
      {
        size: 100,
        text: async () =>
          JSON.stringify({
            format: "tri-logic",
            version: 2,
            size: 2,
            orientation: "W",
            solution: [1, 0, 0, 0],
          }),
      },
    ],
  });
  await fileInput.onchange();
  assert(h.state.custom && !h.state.editing && h.state.orientation === 3);
  assert(d.getElementById("home").hidden);
  h.tapTip();
  assert(h.state.won);
  h.click("next-puzzle");
  assert(!d.getElementById("home").hidden);
  h.click("new-game");
  assert.equal(h.state.level, 0);
  assert(!h.state.won);
  const patterns = [
    "0111100010100100",
    "0011011111111010000111101",
    "000001001011111000111110111101110001",
    "1111010111011..1011000..101000011011",
  ];
  for (let level = 0; level < patterns.length; level++) {
    assert.equal(h.state.level, level);
    const n = h.state.n,
      half = Math.min((900 - 96) / 2, (760 - 144) / Math.sqrt(3)),
      step = half / n;
    let tile = 0,
      lastFilled;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++)
        for (let o = 0; o < 2; o++) {
          if (i + j + o >= n) continue;
          if (patterns[level][tile++] === "1") {
            const x = 450 + (j - i) * step,
              y =
                380 -
                (half * Math.sqrt(3)) / 2 +
                (n - i - j - (o ? 4 / 3 : 2 / 3)) * step * Math.sqrt(3);
            lastFilled = [x, y];
            h.exports.game_down(x, y, 1);
            h.exports.game_up();
          }
        }
    assert(h.state.won, "stock puzzle " + level + " solved");
    assert.equal(d.getElementById("clues").style.visibility, "hidden");
    assert(!d.getElementById("completion").hidden);
    if (level === 0) {
      h.exports.game_clear_effects();
      h.exports.game_celebrate();
      assert(h.exports.game_effects(1000));
      h.exports.game_effects(1250);
      assert(Math.abs(h.exports.game_celebration_angle() - 315) < 0.01);
      assert(Math.abs(h.exports.game_celebration_scale() - 1.1) < 0.0001);
      assert(h.exports.game_effects(1500), "solved row sweep continues after the spin");
      assert.equal(h.exports.game_celebration_scale(), 1);
      assert.equal(h.exports.game_celebration_angle(), 0);
      h.exports.game_motion(0);
      h.exports.game_celebrate();
      assert(!h.exports.game_effects(3000));
      h.exports.game_motion(1);
      h.exports.game_celebrate();
      h.exports.game_effects(4000);
      h.exports.game_effects(4250);
      h.click("undo");
      assert(!h.state.won);
      assert.equal(d.getElementById("clues").style.visibility, "");
      assert(d.getElementById("completion").hidden);
      assert.equal(h.exports.game_celebration_scale(), 1);
      h.exports.game_down(...lastFilled, 1);
      h.exports.game_up();
      assert(h.state.won);
    }
    h.click("next-puzzle");
  }
  assert(!d.getElementById("home").hidden, "final Next returns to main menu");
  h.click("new-game");
  assert(!h.state.won && h.state.level === 0);
  console.log(
    "PASS: main menu, level grid, JSON loading/errors, real four-puzzle completion/Next sequence, fresh New Game, and finite reduced-motion-aware celebration.",
  );
  const draftBefore = w.localStorage.getItem("tri-logic-editor");
  const stockBefore = w.localStorage.getItem("tri-logic-v1");
  for (let difficulty = 0; difficulty < 4; difficulty++) {
    h.click("return-home");
    h.click("endless-mode");
    d.querySelectorAll("#difficulties button")[difficulty].click();
    await h.settle(
      () => w.triEndlessRun?.difficulty === difficulty && !w.triMenuOpen,
    );
    assert(h.state.custom && !h.state.editing && !h.state.won);
    assert.equal(h.state.n, 4 + 2 * difficulty);
    assert(d.getElementById("editor-test").hidden);
    assert.equal(d.querySelectorAll("canvas").length, 1);
    h.click("clue-2-1");
    assert.equal(h.state.axis, 2);
    assert.equal(h.state.row, 1);
    const solution = h.state.solution.slice(),
      n = h.state.n;
    const direction = h.state.orientation;
    const half = direction % 2
      ? Math.min((760 - 96) / 2, (900 - 144) / Math.sqrt(3))
      : Math.min((900 - 96) / 2, (760 - 144) / Math.sqrt(3)),
      step = half / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++)
        for (let o = 0; o < 2; o++) {
          if (i + j + o >= n) continue;
          const r = i + j + o,
            id = r * r + 2 * i + o;
          if (solution[id]) {
            let x = (j - i) * step,
              y = -(half * Math.sqrt(3)) / 2 +
                (n - i - j - (o ? 4 / 3 : 2 / 3)) * step * Math.sqrt(3);
            if (direction === 1) [x, y] = [y, -x];
            else if (direction === 2) [x, y] = [-x, -y];
            else if (direction === 3) [x, y] = [-y, x];
            h.exports.game_down(450 + x, 380 + y, 1);
            h.exports.game_up();
          }
        }
    assert(h.state.won);
    h.click("next-puzzle");
    assert(d.getElementById("next-puzzle").disabled);
    await h.settle(() => w.triEndlessRun?.number === 2);
    assert.equal(w.triEndlessRun.difficulty, difficulty);
    assert(!h.state.won);
    assert.notDeepEqual(h.state.solution, solution);
    h.click("editor-json");
    const exported = JSON.parse(await h.download());
    assert.equal(exported.size, n);
    const shareUrl = w.TriShare.url(exported);
    assert(shareUrl.startsWith("https://delta-triplex.example/#seed="));
    const sharedSeed = harness(source, shareUrl.replace(/&orientation=[SENW]/, ""));
    assert(sharedSeed.state.custom && !sharedSeed.state.editing);
    assert.deepEqual(sharedSeed.state.solution, h.state.solution);
    assert.equal(sharedSeed.state.orientation, h.state.orientation);
    sharedSeed.close();
    h.click("editor-share");
    await Promise.resolve();
    assert.equal(d.getElementById("share-output").value, shareUrl);
    assert.deepEqual(exported.solution, h.state.solution);
    assert.equal(w.localStorage.getItem("tri-logic-editor"), draftBefore);
    assert.equal(w.localStorage.getItem("tri-logic-v1"), stockBefore);
  }
  h.click("return-home");
  h.click("endless-mode");
  d.querySelectorAll("#difficulties button")[3].click();
  h.click("home-back");
  await h.settle(() => true);
  assert(!d.getElementById("home").hidden);
  assert.equal(w.triEndlessRun, null);
  assert.equal(
    d.getElementById("difficulties").getAttribute("aria-busy"),
    null,
  );
  console.log(
    "PASS: all four Endless difficulties, real generated-puzzle solve and Next, shared clues, JSON export, draft/stock save isolation, and cancelled generation.",
  );
  const nav = harness(source);
  assert(!nav.d.querySelector("#puzzle-menu #levels"));
  assert(!nav.d.getElementById("menu-levels"));
  nav.click("new-game");
  const bg = nav.d.getElementById("background-color"),
    cell = nav.d.getElementById("cell-color");
  bg.value = "#224466";
  bg.dispatchEvent(new nav.w.Event("input"));
  cell.value = "#eeddcc";
  cell.dispatchEvent(new nav.w.Event("input"));
  nav.click("level-1");
  assert.equal(bg.value, "#224466");
  assert.equal(cell.value, "#eeddcc");
  nav.click("dice-cell");
  assert.equal(bg.value, "#224466");
  const rolled = cell.value;
  nav.click("level-2");
  assert.equal(cell.value, rolled);
  nav.click("dice-bg");
  assert.equal(cell.value, rolled);
  assert(!nav.d.getElementById("clear-colour-bg").hidden);
  const fixedCell = cell.value;
  nav.click("clear-colour-bg");
  assert(nav.d.getElementById("clear-colour-bg").hidden);
  assert.equal(cell.value, fixedCell);
  assert(!JSON.parse(nav.w.localStorage.getItem("delta-triplex-colours")).bg);
  nav.click("level-3");
  assert.equal(cell.value, fixedCell);
  const saved = nav.w.localStorage.getItem("delta-triplex-colours");
  const reload = harness(source, "https://tri.test/", {
    "delta-triplex-colours": saved,
  });
  assert(reload.d.getElementById("clear-colour-bg").hidden);
  assert.equal(reload.d.getElementById("cell-color").value, cell.value);
  reload.close();
  nav.click("menu-toggle");
  assert(!nav.d.getElementById("puzzle-menu").hidden);
  nav.w.history.back();
  await nav.settle(() => nav.d.getElementById("puzzle-menu").hidden);
  assert(
    nav.d.getElementById("home").hidden,
    "first Back closes dialog without leaving play",
  );
  nav.w.history.back();
  await nav.settle(() => !nav.d.getElementById("home").hidden);
  assert.equal(
    nav.w.history.state.deltaTriplex.depth,
    0,
    "main menu leaves no Back guard",
  );
  nav.click("select-level");
  nav.w.history.back();
  await nav.settle(() => nav.d.getElementById("home-levels").hidden);
  nav.click("new-game");
  nav.click("menu-toggle");
  nav.click("menu-close");
  await nav.settle(() => nav.w.history.state.deltaTriplex.depth === 1);
  nav.w.history.back();
  await nav.settle(() => !nav.d.getElementById("home").hidden);
  nav.close();
  console.log(
    "PASS: single level grid, persisted independent colours/dice, and browser Back closing dialogs then returning home without phantom entries.",
  );
  h.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
