const assert = require('assert'), P = require('./palette.js');
assert.equal(P.rotateHue('#ff0000', 120), '#00ff00');
assert.equal(P.rotateHue('#ff0000', -120), '#0000ff');
assert.equal(P.rotateHue('#18304c', 360), '#18304c');
assert.equal(P.rotateHue('#888888', 73), '#888888');
const { harness, source } = require('./test_rotation_harness.cjs');
for (const mode of ['light', 'dark']) {
  const theme = P.theme(mode);
  assert.equal(theme.bg, mode === 'light' ? '#ffffff' : '#000000');
  assert.equal(theme.cell, mode === 'light' ? '#000000' : '#ffffff');
  for (const color of Object.values(theme)) {
    assert(/^#([0-9a-f]{2})\1\1$/.test(color), 'interface palette is monochrome');
  }
  assert(P.contrast(theme.bg, theme.empty) >= 3);
  assert(P.contrast(theme.cell, theme.empty) >= 2.8);
  for (const bg of [theme.bg, theme.surface, theme.hover])
    for (const key of ['ink', 'muted', 'a', 'b', 'c', 'mint']) assert(P.contrast(bg, theme[key]) >= 4.5);
  for (let stage = 0; stage < 14; stage++) {
    assert.equal(P.flash(theme.cell, stage, 0), theme.cell);
    assert.equal(P.flash(theme.cell, stage, 1), P.rainbow[stage % 7]);
    for (const base of [theme.cell, theme.empty]) {
      const fill = P.flash(base, stage, .3);
      assert(P.contrast(fill, P.ink(fill)) >= 4.5);
    }
  }
}
assert.equal(new Set(P.rainbow).size, 7);
for (const darkMode of [false, true]) {
  const h = harness(source, 'https://tri.test/', {}, { darkMode });
  const root = h.d.documentElement, picker = h.d.getElementById('theme-mode');
  const system = h.w.matchMedia('(prefers-color-scheme: dark)');
  assert.equal(root.style.colorScheme, darkMode ? 'dark' : 'light');
  assert.equal(root.style.getPropertyValue('--bg'), darkMode ? '#000000' : '#ffffff');
  assert.equal(h.d.querySelectorAll('input[type="color"]').length, 2, 'both colour pickers available');
  system.change(!darkMode);
  assert.equal(root.style.colorScheme, darkMode ? 'light' : 'dark', 'System follows live OS changes');
  for (const mode of ['light', 'dark']) {
    picker.value = mode; picker.dispatchEvent(new h.w.Event('change')); h.frame();
    assert.equal(root.style.colorScheme, mode);
    assert.equal(h.w.localStorage.getItem('delta-triplex-theme'), mode);
    system.change(mode !== 'dark');
    assert.equal(root.style.colorScheme, mode, 'explicit choice overrides OS');
    h.startPuzzle(); h.frame();
    assert.equal(root.style.getPropertyValue('--cell'), mode === 'dark' ? '#ffffff' : '#000000');
    const restored = harness(source, 'https://tri.test/', {'delta-triplex-theme': mode}, {darkMode: mode !== 'dark'});
    assert.equal(restored.d.documentElement.style.colorScheme, mode, 'theme survives reload');
    restored.close();
  }
  h.close();
}
console.log('PASS: monochrome light/dark contrast, ROYGBIV flashes, theme persistence and system preference changes.');

let seed = 17;
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
for (let i = 0; i < 2000; i++) {
  const base = P.random(rng), theme = P.theme('colorful', {}, base);
  assert(P.contrast(base.bg, base.cell) >= 9);
  assert(P.contrast(theme.empty, theme.bg) >= 3);
  assert(P.contrast(theme.empty, theme.cell) >= 2.8);
  for (const background of [theme.bg, theme.surface, theme.hover])
    for (const name of ['ink', 'mint', 'a', 'b', 'c']) assert(P.contrast(theme[name], background) >= 4.5);
}
for (const mode of ['system', 'light', 'dark', 'colorful']) {
  const h = harness(source, 'https://tri.test/', {'delta-triplex-theme': mode}, {reducedMotion: false});
  const root = h.d.documentElement, home = h.d.getElementById('home');
  const pick = (id, value) => { const input = h.d.getElementById(id); input.value = value; input.dispatchEvent(new h.w.Event('input')); };
  const base = root.style.getPropertyValue('--bg');
  pick('background-color', '#123456'); pick('cell-color', '#fedcba');
  for (let i = 0; i < 20; i++) h.frame(100);
  for (const target of [root, home]) {
    assert.equal(target.style.getPropertyValue('--bg'), '#123456');
    assert.equal(target.style.getPropertyValue('--cell'), '#fedcba');
  }
  assert(!h.d.getElementById('clear-colour-bg').hidden);
  const restored = harness(source, 'https://tri.test/', {
    'delta-triplex-theme': mode,
    'delta-triplex-rotation-colours': h.w.localStorage.getItem('delta-triplex-rotation-colours'),
  });
  assert.equal(restored.d.documentElement.style.getPropertyValue('--bg'), '#123456');
  restored.close();
  // Theme switches retain explicit overrides, including System preference changes.
  const select = h.d.getElementById('theme-mode');
  select.value = mode === 'dark' ? 'light' : 'dark'; select.dispatchEvent(new h.w.Event('change'));
  assert.equal(root.style.getPropertyValue('--cell'), '#fedcba');
  select.value = mode; select.dispatchEvent(new h.w.Event('change'));
  h.w.matchMedia('(prefers-color-scheme: dark)').change(false);
  assert.equal(root.style.getPropertyValue('--bg'), '#123456');
  h.click('clear-colour-bg');
  assert.equal(root.style.getPropertyValue('--bg'), base);
  assert.equal(root.style.getPropertyValue('--cell'), '#fedcba');
  assert(h.d.getElementById('clear-colour-bg').hidden);
  h.click('clear-colour-cell');
  h.click('dice-cell');
  assert(P.contrast(root.style.getPropertyValue('--bg'), root.style.getPropertyValue('--cell')) >= 6);
  assert(!h.d.getElementById('clear-colour-cell').hidden);
  h.click('clear-colour-cell');
  const oldHome = home.style.cssText, oldGame = root.style.cssText;
  for (let i = 0; i < 20; i++) h.frame(100);
  assert.equal(home.style.cssText === oldHome, mode !== 'colorful', 'only colorful menus drift');
  assert.equal(root.style.cssText, oldGame, 'menu drift leaves gameplay palette untouched');
  for (const node of home.querySelectorAll('[data-row]')) {
    const glow = +node.style.getPropertyValue('--row-glow');
    if (glow > 0 && mode === 'colorful') {
      const base = home.style.getPropertyValue(node.classList.contains('home-banner') ? '--cell' : node.classList.contains('home-up') ? '--home-dim' : '--empty');
      assert.equal(node.style.getPropertyValue('--flash-fill'), P.mix(base, '#ffffff', glow), 'colorful menu flashes white');
    }
  }
  h.close();
}
console.log('PASS: colorful contrast, per-color overrides/clearing/randomization, persistence, theme switches, menu drift and white flashes.');
