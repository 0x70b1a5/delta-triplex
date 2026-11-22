// Renders art.html into the store art, the share image and the video end cards.
//   node marketing/render-art.cjs [name-filter ...]
// The board pictures come from marketing/shots/ (real screenshots, made by capture.cjs).
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || path.join(process.env.HOME, ".claude/tools/playwright/node_modules/playwright"));
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
// The Mug Shot board, its rails and clues, in CSS px of a 1280x720 screenshot.
const BOARD = "282,62,716,548";
const OUT = [
  { name: "cover-itch-630x500@2x", w: 630, h: 500, scale: 2, layout: "stack", shot: "board-dark.png", crop: BOARD },   // itch.io cover, 315:250
  { name: "card-720x405@2x", w: 720, h: 405, scale: 2, layout: "side", shot: "board-dark.png", crop: BOARD, by: 0 },   // Newgrounds card, 16:9
  { name: "og-1200x630", w: 1200, h: 630, scale: 1, layout: "side", shot: "board-dark.png", crop: BOARD },             // link previews
  { name: "endcard-1920x1080", w: 1280, h: 720, scale: 1.5, layout: "end" },
  { name: "endcard-828x1472", w: 414, h: 736, scale: 2, layout: "end" },
];
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const only = process.argv.slice(2);
  for (const o of OUT.filter(o => !only.length || only.some(name => o.name.includes(name)))) {
    const page = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.scale });
    page.on("pageerror", error => console.error(error.message));
    const q = new URLSearchParams({ w: o.w, h: o.h, layout: o.layout, ...(o.shot ? { shot: o.shot, crop: o.crop } : {}), ...(o.by === 0 ? { by: 0 } : {}) });
    await page.goto("file://" + path.join(__dirname, "art.html") + "?" + q);
    await page.waitForSelector("body[data-ready]", { state: "attached", timeout: 10e3 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(__dirname, o.name + ".png") });
    console.log(o.name + ".png");
    await page.close();
  }
  await browser.close();
})();
