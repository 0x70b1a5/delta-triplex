// Renders cover.html to PNGs: node marketing/render-cover.cjs
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || path.join(process.env.HOME, ".claude/tools/playwright/node_modules/playwright"));
const SIZES = [
  { name: "cover-itch-630x500", w: 630, h: 500, scale: 2 },  // itch.io cover, 315:250
  { name: "card-720x405", w: 720, h: 405, scale: 2 },        // Newgrounds card, 16:9
];
(async () => {
  const browser = await chromium.launch();
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.scale });
    page.on("pageerror", error => console.error(error.message));
    await page.goto("file://" + path.join(__dirname, "cover.html") + `?w=${size.w}&h=${size.h}`);
    await page.waitForSelector("body[data-ready]", { state: "attached", timeout: 10e3 });
    await page.screenshot({ path: path.join(__dirname, `${size.name}@${size.scale}x.png`) });
    console.log(`${size.name}@${size.scale}x.png`);
  }
  await browser.close();
})();
