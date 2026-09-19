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
function harness(html, url = "https://tri.test/", storage = {}, options = {}) {
  const dom = new JSDOM(html, {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url,
    }),
    w = dom.window,
    d = w.document;
  if (!options.firstGame) w.localStorage.setItem('delta-triplex-theme-welcome', '1');
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const [key, value] of Object.entries(storage))
    w.localStorage.setItem(key, value);
  const timers = new Map(),
    frames = new Map();
  let seq = 0;
  const media = new Map();
  w.matchMedia = query => {
    if (!media.has(query)) {
      const listeners = [];
      media.set(query, {
        matches: query.includes('prefers-color-scheme') ? !!options.darkMode : options.reducedMotion ?? true,
        addEventListener(type, listener) { listeners.push(listener); },
        change(matches) { this.matches = matches; for (const listener of listeners) listener({ matches }); },
      });
    }
    return media.get(query);
  };
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
  w.innerWidth = 1000;
  let now = 0;
  w.performance.now = () => now;
  let viewport = { width: 900, height: 760 };
  const rect = () => ({
    left: 0,
    top: 0,
    width: viewport.width,
    height: viewport.height,
    right: viewport.width,
    bottom: viewport.height,
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
  imports.env.read_text = (key, destination, capacity) => {
    const value = w.localStorage.getItem(decode(key));
    if (value === null) return 0;
    const bytes = new TextEncoder().encode(value + "\0");
    new Uint8Array(exports.memory.buffer).set(bytes.subarray(0, capacity), destination);
    return 1;
  };
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
  exports.game_boot();
  w.triReady();
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(now));
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
    resize(width, height) { viewport = { width, height }; w.innerWidth = width; w.dispatchEvent(new w.Event("resize")); flush(); },
    frame(ms = 0) { now += ms; flush(); },
    advance(ms) { now += ms; d.dispatchEvent(new w.Event("visibilitychange")); },
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
module.exports = { harness, source };
