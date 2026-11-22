// Clean screenshots of real play (no cursor), for the store art and the og image.
// usage: node marketing/capture.cjs marketing/shots
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || path.join(process.env.HOME, ".claude/tools/playwright/node_modules/playwright"));
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
// A local server with a COPY of the database: recording submits real solves.
const BASE = process.env.DELTA_URL || "http://localhost:8798/game.html";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });

async function session(browser, { width, height, scale, theme, touch = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale,
    colorScheme: theme === "light" ? "light" : "dark", isMobile: touch, hasTouch: touch });
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
  }, [theme]);
  const page = await ctx.newPage();
  page.on("pageerror", e => console.error("pageerror", e.message));
  return { ctx, page };
}
async function boardInfo(page) {
  return page.evaluate(() => {
    const cells = state.cells.map(c => { const r = c.i + c.j + c.o; return { i: c.i, j: c.j, o: c.o, fill: state.solution[r * r + 2 * c.i + c.o] === 1 }; });
    const centres = {};
    for (const p of document.querySelectorAll("#rotate-board [data-cell]")) {
      const m = p.getScreenCTM(); let x = 0, y = 0;
      for (let k = 0; k < p.points.numberOfItems; k++) { const q = p.points.getItem(k); x += m.a * q.x + m.c * q.y + m.e; y += m.b * q.x + m.d * q.y + m.f; }
      centres[p.dataset.cell] = [x / p.points.numberOfItems, y / p.points.numberOfItems];
    }
    return { n: state.n, cells, centres, clues: state.clues.map(a => a.map(r => r.runs.length)) };
  });
}
async function tap(page, xy, touch, button = "left") {
  if (touch) await page.touchscreen.tap(...xy);
  else { await page.mouse.move(...xy); await page.mouse.down({ button }); await page.mouse.up({ button }); }
}
// Marks a believable partial solve: crosses on the empty lines, fills on chosen lines.
async function partial(page, touch, pick) {
  const b = await boardInfo(page);
  for (const [k, c] of b.cells.entries()) {
    const zero = b.clues[0][c.i] === 0 || b.clues[1][c.j] === 0;
    if (zero && !c.fill) { await tap(page, b.centres[k], touch, "right"); if (touch) await tap(page, b.centres[k], touch); }
    else if (c.fill && pick(c, b.n)) await tap(page, b.centres[k], touch);
    await page.waitForTimeout(25);
  }
  await page.mouse.move(5, 5).catch(() => {});
}
async function solveRest(page, touch) {
  const b = await boardInfo(page);
  const st = await page.evaluate(() => state.cells.map(c => c.state));
  for (const [k, c] of b.cells.entries()) if (c.fill && st[k] !== 1) { if (st[k] === 2) await tap(page, b.centres[k], touch); await tap(page, b.centres[k], touch); }
  await page.mouse.move(5, 5).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
  const shots = [];
  const snap = async (page, name) => { await page.screenshot({ path: path.join(out, name + ".png") }); shots.push(name); };

  for (const theme of ["dark", "light"]) {
    // Home.
    const { ctx, page } = await session(browser, { width: 1280, height: 720, scale: 2, theme });
    await page.goto(BASE, { waitUntil: "networkidle" }); await page.waitForTimeout(2200);
    await page.mouse.move(5, 5);
    await snap(page, `home-${theme}`);
    // Mug Shot mid-solve and solved.
    await page.goto(BASE + "#daily=2026-11-16", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("home").hidden && state?.custom);
    await page.waitForTimeout(800);
    await partial(page, false, (c, n) => c.i >= 3 || c.j >= 4);
    await page.waitForTimeout(theme === "dark" ? 350 : 1600);
    await snap(page, `board-${theme}`);
    await solveRest(page, false);
    await page.waitForTimeout(600);
    await page.click("#submit-solution");
    await page.waitForTimeout(1800);
    await snap(page, `solving-${theme}`);
    await page.waitForFunction(() => !document.getElementById("daily-stats").hidden, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await snap(page, `stats-${theme}`);
    await page.click("#daily-stats-close").catch(() => {});
    await page.waitForTimeout(2500);
    await page.mouse.move(5, 5);
    await snap(page, `solved-${theme}`);
    await ctx.close();
  }
  // Phone: home and a board mid-solve, Colorful theme for variety.
  {
    const { ctx, page } = await session(browser, { width: 390, height: 844, scale: 3, theme: "colorful", touch: true });
    await page.goto(BASE, { waitUntil: "networkidle" }); await page.waitForTimeout(2000);
    await snap(page, "phone-home-colorful");
    await page.goto(BASE + "#daily=2026-11-17", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("home").hidden && state?.custom);
    await page.waitForTimeout(800);
    await partial(page, true, (c, n) => c.i >= 2);
    await page.waitForTimeout(1500);
    await snap(page, "phone-board-colorful");
    await ctx.close();
  }
  console.log(shots.join(" "));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
