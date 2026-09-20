const assert = require("assert");
const { harness, source } = require("./test_rotation_harness.cjs");
const h = harness(source, "https://tri.test/", {}, { reducedMotion: false });
h.click("new-game");
const { d, w } = h;
const svg = d.getElementById("rotate-board");
svg.setPointerCapture = () => {};
function pointer(type, target, x, y) {
  const event = new w.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, pointerType: "touch", clientX: x, clientY: y });
  target.dispatchEvent(event); h.frame();
}
function checkFrame() {
  const g = w.TriRotation.geometry;
  for (const axis of [0, 1]) assert(Math.abs(g.outer.reduce((sum, p) => sum + p[axis], 0) / 3 - (axis ? g.height : g.width) / 2) < 1e-6, "triangle centroid stays at the stage center");
  for (const [x, y] of g.outer) assert(x >= 11.99 && y >= 11.99 && x <= g.width - 11.99 && y <= g.height - 11.99, "every animated vertex fits");
  if (g.moving) assert.equal(svg.querySelectorAll("text[data-axis]").length, 0, "clues wait until the board settles");
}
for (const [width, height] of [[1440, 760], [900, 550], [390, 480], [320, 360], [800, 240]]) {
  h.resize(width, height);
  const g = w.TriRotation.geometry;
  const initialAngle = g.angle, initialScale = g.scale;
  const top = Math.min(...g.outer.map(p => p[1]));
  if (g.desktop) assert.equal(g.outer.filter(p => Math.abs(p[1] - top) < 1e-6).length, 2, "desktop base is horizontal at the top");
  const initialTurns = w.TriRotation.stats.turns;
  h.click("turn-right");
  assert(w.TriRotation.stats.animating);
  assert.equal(w.TriRotation.geometry.angle, initialAngle, "no jump on the first frame");
  const cells = JSON.stringify(h.state.cells);
  pointer("pointerdown", svg.querySelector("polygon"), 200, 200);
  pointer("pointerup", svg, 200, 200);
  assert.equal(JSON.stringify(h.state.cells), cells, "cells cannot be marked during animation");
  let smallest = initialScale, previous = initialAngle;
  for (let tick = 0; tick < 28; tick++) {
    h.frame(16); checkFrame();
    const current = w.TriRotation.geometry;
    assert(current.angle >= previous - 1e-6 && current.angle <= initialAngle + 120 + 1e-6);
    assert(current.angle - previous < 10, "smooth per-frame angular progression");
    smallest = Math.min(smallest, current.scale); previous = current.angle;
  }
  assert(!w.TriRotation.stats.animating);
  assert(Math.abs(w.TriRotation.geometry.angle - initialAngle - 120) < 1e-6);
  assert.equal(w.TriRotation.stats.turns, initialTurns + 1);
  assert(svg.querySelectorAll("text[data-axis]").length > 0);
  assert(Math.abs(smallest - initialScale) < 1e-6, "rotation keeps its scale");
  // Drag follows the finger. The remaining angle animates rather than jumping.
  const beforeSwipe = w.TriRotation.geometry.angle, beforeTurns = w.TriRotation.stats.turns;
  pointer("pointerdown", svg, 200, 200);
  pointer("pointermove", svg, 275, 200);
  assert(Math.abs(w.TriRotation.geometry.angle - beforeSwipe - (width >= 900 ? 75 : 37.5)) < 1e-6, "mobile swipe preview has half desktop sensitivity");
  checkFrame();
  const releaseAngle = w.TriRotation.geometry.angle;
  pointer("pointerup", svg, 275, 200);
  assert(Math.abs(w.TriRotation.geometry.angle - releaseAngle) < 1e-6, "no jump at gesture release");
  for (let tick = 0; tick < 28; tick++) { h.frame(16); checkFrame(); }
  assert(!w.TriRotation.stats.animating);
  assert.equal(w.TriRotation.stats.turns - beforeTurns, width >= 900 ? 1 : 0, "mobile swipe requires twice the travel to commit");
  // Subthreshold swipes ease back and do not increase the rotation count.
  const turns = w.TriRotation.stats.turns, settled = w.TriRotation.geometry.angle;
  pointer("pointerdown", svg, 200, 200);
  pointer("pointermove", svg, 220, 200);
  pointer("pointerup", svg, 220, 200);
  assert(w.TriRotation.stats.animating);
  for (let tick = 0; tick < 15; tick++) { h.frame(16); checkFrame(); }
  assert.equal(w.TriRotation.stats.turns, turns);
  assert(Math.abs(w.TriRotation.geometry.angle - settled) < 1e-6);
}
// Hue follows the exact visual angle, reverses on snap-back, and never rewrites preferences.
const palette = require("./palette.js");
for (const [id, value] of [["background-color", "#18304c"], ["cell-color", "#edbd91"]]) {
  d.getElementById(id).value = value;
  d.getElementById(id).dispatchEvent(new w.Event("input"));
}
h.frame();
const saved = w.localStorage.getItem("delta-triplex-rotation-colours");
const baseAngle = w.TriRotation.geometry.desktop ? 0 : -90;
function checkHue() {
  const angle = w.TriRotation.geometry.angle - baseAngle;
  for (const [key, value] of [["bg", "#18304c"], ["cell", "#edbd91"]])
    assert.equal(d.documentElement.style.getPropertyValue("--" + key), palette.rotateHue(value, angle));
  assert.equal(w.localStorage.getItem("delta-triplex-rotation-colours"), saved);
}
const initialColors = ["bg", "cell"].map(key => d.documentElement.style.getPropertyValue("--" + key));
for (let turn = 0; turn < 3; turn++) {
  h.click("turn-right");
  for (let tick = 0; tick < 28; tick++) { h.frame(16); checkHue(); }
}
assert.deepEqual(["bg", "cell"].map(key => d.documentElement.style.getPropertyValue("--" + key)), initialColors);
pointer("pointerdown", svg, 200, 200);
pointer("pointermove", svg, 220, 200);
checkHue();
assert.notEqual(d.documentElement.style.getPropertyValue("--bg"), initialColors[0]);
pointer("pointerup", svg, 220, 200);
for (let tick = 0; tick < 28; tick++) { h.frame(16); checkHue(); }
assert.deepEqual(["bg", "cell"].map(key => d.documentElement.style.getPropertyValue("--" + key)), initialColors);
h.close();
console.log("PASS: horizontal desktop base, centered/maximized layout, smooth turns and gesture settling, fixed scale and centroid on every frame, input suppression, and subthreshold snap-back.");
