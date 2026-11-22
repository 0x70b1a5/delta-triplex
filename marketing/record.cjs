// Records real play of Delta Triplex frame by frame against the local server.
// usage: node marketing/record.cjs desktop|phone <frames-dir>, then marketing/encode.sh
// Time is virtual (vclock.js): each frame is exactly 1/30 s of game time, so the
// video is smooth however slowly this machine renders. The moves come from a line
// solver working only from the clues on screen, turning the board when they run dry.
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || path.join(process.env.HOME, ".claude/tools/playwright/node_modules/playwright"));
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
// A local server with a COPY of the database: recording submits real solves.
const BASE = process.env.DELTA_URL || "http://localhost:8798/game.html";
const FPS = 30, STEP = 1000 / FPS;

const SCENARIOS = {
  // Desktop: home -> Past Puzzles -> Nov 16 (Mug Shot) -> solve -> Submit.
  desktop: { width: 1280, height: 720, scale: 1.5, theme: "dark", touch: false, date: "2026-11-16", via: "calendar", seed: 7, crossRate: 0.35 },
  // Phone: a shared link to Oct 5 (Skips a Beat) -> solve -> Submit.
  phone: { width: 414, height: 736, scale: 2, theme: "light", touch: true, date: "2026-10-05", via: "link", seed: 3, crossRate: 0.0, turnAfter: 3 },
};

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 >>> 0) / 2 ** 32); }
const ease = u => (u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

// All ways to place runs in a line consistent with what is known; returns forced cells.
function lineDeduce(len, runs, known) {
  const sols = [];
  const cur = new Array(len).fill(0);
  (function place(k, start) {
    if (sols.length > 20000) return;
    if (k === runs.length) {
      for (let p = start; p < len; p++) cur[p] = 0;
      for (let p = 0; p < len; p++) if (known[p] !== -1 && known[p] !== cur[p]) return;
      sols.push(cur.slice()); return;
    }
    const rest = runs.slice(k + 1).reduce((a, b) => a + b + 1, 0);
    for (let s = start; s + runs[k] + rest <= len; s++) {
      let ok = true;
      for (let p = start; p < s; p++) { cur[p] = 0; if (known[p] === 1) { ok = false; break; } }
      if (!ok) break;
      for (let p = s; p < s + runs[k]; p++) { cur[p] = 1; if (known[p] === 0) ok = false; }
      if (ok && s + runs[k] < len) { cur[s + runs[k]] = 0; if (known[s + runs[k]] === 1) ok = false; }
      if (ok) place(k + 1, s + runs[k] + 1);
    }
  })(0, 0);
  if (!sols.length) return null;
  const out = [];
  for (let p = 0; p < len; p++) if (known[p] === -1 && sols.every(s => s[p] === sols[0][p])) out.push([p, sols[0][p]]);
  return out;
}
const runsOf = bits => { const r = []; let c = 0; for (const b of bits) { if (b) c++; else if (c) { r.push(c); c = 0; } } if (c) r.push(c); return r; };

(async () => {
  const name = process.argv[2], out = process.argv[3];
  const S = SCENARIOS[name]; if (!S) throw Error("scenario?");
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (f.endsWith(".png")) fs.unlinkSync(path.join(out, f));
  const random = rng(S.seed);

  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
  const ctx = await browser.newContext({ viewport: { width: S.width, height: S.height }, deviceScaleFactor: S.scale,
    colorScheme: S.theme === "light" ? "light" : "dark", isMobile: S.touch, hasTouch: S.touch, reducedMotion: "no-preference" });
  await ctx.route(/deltatriplex\.com|goat\.theologi\.ca/, r => r.abort());
  await ctx.addInitScript(([theme]) => {
    try {
      if (!sessionStorage.getItem("rec-init")) {
        localStorage.clear();
        localStorage.setItem("delta-triplex-theme-welcome", "1");
        localStorage.setItem("delta-triplex-theme", theme);
        localStorage.setItem("delta-triplex-sound", JSON.stringify({ master: 0, music: 0, sfx: 0 }));
        sessionStorage.setItem("rec-init", "1");
      }
    } catch {}
  }, [S.theme]);
  await ctx.addInitScript({ path: path.join(__dirname, "vclock.js") });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const cdp = await ctx.newCDPSession(page);

  const hash = S.via === "link" ? "#daily=" + S.date : "";
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof state !== "undefined" && state && state.cells && appReady);
  if (S.via === "link") await page.waitForFunction(() => document.getElementById("home").hidden && state.custom);
  await page.waitForTimeout(600);
  await page.evaluate(() => __vstart());

  let frame = 0, cx = S.width * 0.72, cy = S.height * 0.78, cursorKind = S.touch ? "none" : "arrow";
  async function shot() {
    await page.evaluate(([ms, x, y, k]) => { __vstep(ms); __cursor(x, y, k); }, [STEP, cx, cy, cursorKind]);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: S.width, height: S.height, scale: S.scale } });
    fs.writeFileSync(path.join(out, `f${String(frame++).padStart(5, "0")}.png`), Buffer.from(data, "base64"));
  }
  async function wait(ms) { for (let t = 0; t < ms; t += STEP) await shot(); }
  async function waitFor(fn, max = 4000) { for (let t = 0; t < max; t += STEP) { if (await page.evaluate(fn)) return true; await shot(); } return false; }
  async function moveTo(x, y, ms) {
    const x0 = cx, y0 = cy, n = Math.max(1, Math.round(ms / STEP));
    for (let k = 1; k <= n; k++) {
      const u = ease(k / n); cx = x0 + (x - x0) * u; cy = y0 + (y - y0) * u;
      if (!S.touch) await page.mouse.move(cx, cy);
      await shot();
    }
  }
  async function click(button = "left") {
    if (S.touch) {
      await page.touchscreen.tap(cx, cy);
      await page.evaluate(([x, y]) => __ring(x, y, "rgba(128,128,128,.95)", 44), [cx, cy]);
    } else {
      await page.mouse.down({ button }); await page.mouse.up({ button });
      await page.evaluate(([x, y, b]) => __ring(x, y, b === "right" ? "rgba(255,120,120,.95)" : "rgba(255,255,255,.95)", 30), [cx, cy, button]);
    }
    await shot();
  }
  async function center(selector) {
    // Triangular buttons overlap their neighbours' boxes: aim at the middle of what really hits.
    return page.evaluate(sel => {
      const e = document.querySelector(sel), r = e.getBoundingClientRect(), x = r.left + r.width / 2, hits = [];
      for (let k = 1; k < 40; k++) { const y = r.top + r.height * k / 40, h = document.elementFromPoint(x, y); if (h && (h === e || e.contains(h))) hits.push(y); }
      return [x, hits.length ? (hits[0] + hits[hits.length - 1]) / 2 : r.top + r.height / 2];
    }, selector);
  }
  async function clickEl(selector, ms = 600) { const [x, y] = await center(selector); await moveTo(x, y, ms); await wait(120); await click(); }

  // ---- Getting to the puzzle ----
  await wait(S.via === "link" ? 700 : 1300);
  if (S.via === "calendar") {
    await clickEl("#past-puzzles", 750);
    await wait(900);
    await clickEl(`#calendar-grid button[data-date="${S.date}"]`, 800);
    if (!(await waitFor(() => document.getElementById("home").hidden && state.custom, 5000))) throw Error("puzzle did not open");
    await wait(700);
  }

  // ---- The board, as the solver sees it ----
  const board = await page.evaluate(() => {
    const n = state.n;
    return { n, clues: state.clues.map(ax => ax.map(r => r.runs)),
      cells: state.cells.map(c => { const r = c.i + c.j + c.o; return { i: c.i, j: c.j, o: c.o, active: c.active, fill: state.solution[r * r + 2 * c.i + c.o] === 1 }; }) };
  });
  const n = board.n, lines = [[], [], []];
  for (let a = 0; a < 3; a++) for (let r = 0; r < n; r++) lines[a][r] = [];
  board.cells.forEach((c, k) => { if (!c.active) return; lines[0][c.i].push(k); lines[1][c.j].push(k); lines[2][n - 1 - c.i - c.j - c.o].push(k); });
  for (let a = 0; a < 3; a++) for (let r = 0; r < n; r++) {
    const key = k => { const c = board.cells[k]; return 2 * (a === 0 ? c.j : c.i) + c.o; };
    lines[a][r].sort((p, q) => key(q) - key(p));
    const want = board.clues[a][r].join(","), got = runsOf(lines[a][r].map(k => board.cells[k].fill));
    if (got.join(",") !== want) {
      lines[a][r].reverse();
      if (runsOf(lines[a][r].map(k => board.cells[k].fill)).join(",") !== want) throw Error(`line order ${a}/${r}`);
    }
  }
  const known = new Map();
  let turnCount = 0; // turn-right count mod 3
  const visibleAxes = () => [[0, 1], [2, 0], [1, 2]][turnCount % 3];

  async function cellCentres() {
    return page.evaluate(() => {
      const out = {};
      for (const p of document.querySelectorAll("#rotate-board [data-cell]")) {
        const m = p.getScreenCTM(); let x = 0, y = 0;
        for (let k = 0; k < p.points.numberOfItems; k++) { const q = p.points.getItem(k); x += m.a * q.x + m.c * q.y + m.e; y += m.b * q.x + m.d * q.y + m.f; }
        out[p.dataset.cell] = [x / p.points.numberOfItems, y / p.points.numberOfItems];
      }
      return out;
    });
  }
  let centres = await cellCentres();

  async function mark(k, fill) {
    const [x, y] = centres[k];
    const d = Math.hypot(x - cx, y - cy);
    await moveTo(x, y, Math.min(420, 120 + d * 0.9));
    await wait(40 + random() * 60);
    if (fill) await click("left");
    else if (S.touch) { await click(); await wait(110); await click(); }
    else await click("right");
  }

  // Greedy line solving on the visible clues; turn when they run dry.
  let idle = 0, first = true, batches = 0;
  while (known.size < board.cells.filter(c => c.active).length) {
    let best = null;
    for (const a of visibleAxes()) for (let r = 0; r < n; r++) {
      const ln = lines[a][r];
      const res = lineDeduce(ln.length, board.clues[a][r], ln.map(k => (known.has(k) ? known.get(k) : -1)));
      if (!res || !res.length) continue;
      const fills = res.filter(([, v]) => v === 1).length;
      const score = first ? (board.clues[a][r].length === 0 ? 100 : 0) + fills : fills + res.length * 0.25;
      if (!best || score > best.score) best = { a, r, res, score };
    }
    if (!best || (S.turnAfter && batches === S.turnAfter && turnCount === 0)) {
      if (++idle > 3) throw Error("solver stuck");
      await wait(350);
      await clickEl("#turn-right", 650);
      turnCount++;
      await wait(700);
      centres = await cellCentres();
      await wait(300);
      continue;
    }
    idle = 0;
    const ln = lines[best.a][best.r], zeroLine = board.clues[best.a][best.r].length === 0;
    for (const [p, v] of best.res) {
      const k = ln[p]; known.set(k, v);
      if (v === 1 || zeroLine || random() < S.crossRate) await mark(k, v === 1);
    }
    first = false; batches++;
    await wait(120 + random() * 220);
  }

  // Turn back upright so the finished picture reads the way it was drawn.
  if (turnCount % 3) {
    await wait(300);
    await clickEl(turnCount % 3 === 1 ? "#turn-left" : "#turn-right", 600);
    turnCount += turnCount % 3 === 1 ? -1 : 1;
    await wait(750);
  }
  // ---- Submit and celebrate ----
  if (!(await waitFor(() => !document.getElementById("submit-solution").hidden, 1500))) throw Error("submit never appeared");
  await wait(250);
  await clickEl("#submit-solution", 650);
  await moveTo(cx + (S.touch ? 0 : 60), cy + (S.touch ? 0 : 40), 400);
  // Stop as the results panel opens: the clip ends on the solved picture.
  await waitFor(() => { const p = document.getElementById("daily-stats"); return p && !p.hidden; }, 4800);
  for (const f of fs.readdirSync(out).sort().slice(-1)) fs.unlinkSync(path.join(out, f)), frame--;
  console.log(JSON.stringify({ frames: frame, seconds: frame / FPS, turns: turnCount, won: await page.evaluate(() => state.won), errors }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
