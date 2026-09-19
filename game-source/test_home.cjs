const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const palette = require('./palette.js');
for (const reducedMotion of [false, true]) {
  const h = harness(source, 'https://tri.test/', {}, { reducedMotion });
  const home = h.d.getElementById('home');
  h.w.triShowHome(); h.frame();
  const before = home.style.getPropertyValue('--bg') + home.style.getPropertyValue('--cell');
  const gameColours = h.d.documentElement.style.cssText;
  for (let i = 0; i < 180; i++) h.frame(100);
  const after = home.style.getPropertyValue('--bg') + home.style.getPropertyValue('--cell');
  assert.equal(before, after, 'homepage base colours remain monochrome');
  assert.equal(h.d.documentElement.style.cssText, gameColours, 'homepage flashes do not change game colours');
  assert.equal(h.d.querySelectorAll('#home-main button').length, 5);
  assert.equal(h.d.querySelector('.home-credit').href, 'https://lovecrypt.itch.io/');
  h.click('select-level'); assert.equal(home.dataset.view, 'levels');
  h.click('home-back'); assert.equal(home.dataset.view, 'main');
  h.click('endless-mode'); assert.equal(home.dataset.view, 'endless');
  h.click('home-back'); h.click('new-game');
  const frozen = home.style.cssText;
  for (let i = 0; i < 10; i++) h.frame(100);
  assert.equal(home.style.cssText, frozen, 'hidden homepage stops animating');
  h.close();
}
console.log('PASS: homepage navigation, monochrome base colours, pause and reduced motion.');

// Layout rectangles stand in for browser measurement; animation and navigation
// run through the same handlers and clock as the real game.
for (const reducedMotion of [false, true]) {
  const h = harness(source, 'https://tri.test/', {}, { reducedMotion });
  const { d, w } = h;
  const sceneRect = scene => ({ left: 20, top: 24, width: 960,
    height: 876 * +scene.dataset.rows / (+scene.dataset.rows - .5) });
  for (const name of ['main', 'levels', 'endless']) {
    const scene = d.getElementById('home-' + name);
    scene.getBoundingClientRect = () => sceneRect(scene);
  }
  for (const id of ['select-level', 'endless-mode']) {
    const button = d.getElementById(id);
    button.getBoundingClientRect = () => {
      const rect = sceneRect(d.getElementById('home-main'));
      return { left: rect.left + parseFloat(button.style.getPropertyValue('--x')) / 100 * rect.width,
        top: rect.top + parseFloat(button.style.getPropertyValue('--y')) / 100 * rect.height,
        width: rect.width / 4, height: rect.height / 4 };
    };
  }
  w.triShowHome(); h.frame();
  const home = d.getElementById('home');
  for (const view of ['levels', 'endless']) {
    h.click(view === 'levels' ? 'select-level' : 'endless-mode');
    const scene = d.getElementById('home-' + view);
    assert(scene.contains(d.getElementById('home-back')), 'back button lives in the submenu tip');
    assert.equal(d.getElementById('home-back').dataset.row, String(+scene.dataset.rows - 1));
    if (!reducedMotion) {
      assert.equal(home.dataset.transition, 'in');
      assert(scene.inert, 'zoom ignores intervening pointer input');
      assert(scene.style.transform.includes('scale(0.25, 0.25)'), 'submenu starts at the source cell size');
      assert.equal(scene.style.opacity, '1', 'the nested submenu is fully drawn on the first frame');
      assert.equal(scene.style.background, 'var(--bg)', 'opaque backing hides the old label through cell gaps');
      assert(scene.style.clipPath.includes('50% 100%'), 'backing is confined to the selected triangle');
      h.frame(180);
      assert(scene.style.transform.includes('scale(0.625, 0.625)'), 'zoom has a continuous midpoint');
      const parent = d.getElementById('home-main');
      assert(parent.style.transform.includes('scale(2.5, 2.5)'), 'the entire parent menu grows, including neighboring cells');
      assert.equal(parent.style.opacity, '1', 'the surrounding menu remains visible during the zoom');
      h.frame(144);
      assert.equal(scene.style.opacity, '1', 'submenu stays opaque near the end of the zoom');
      assert.equal(parent.style.opacity, '1', 'parent never fades before the zoom finishes');
      h.frame(36);
    }
    assert(!home.dataset.transition);
    assert.equal(scene.style.transform, '', 'submenu finishes at the shared outer triangle bounds');
    assert.equal(scene.style.clipPath, '', 'temporary backing is removed after settling');
    assert(d.getElementById('home-main').hidden);
    const activeWaves = new Set([...scene.querySelectorAll('[data-row]')]
      .filter(cell => +cell.style.getPropertyValue('--row-glow') > 0).map(cell => cell.dataset.wave));
    assert.equal(activeWaves.size, reducedMotion ? 0 : 1, 'one edge-distance wave shines, unless reduced motion is enabled');
    h.click('home-back');
    if (!reducedMotion) {
      assert.equal(home.dataset.transition, 'out');
      assert.equal(scene.style.opacity, '1', 'current submenu stays opaque on Back');
      assert.equal(d.getElementById('home-main').style.opacity, '1', 'surrounding parent is drawn immediately on Back');
      assert(d.getElementById('home-main').style.transform.includes('scale(4, 4)'), 'Back starts with the whole parent enlarged');
      h.frame(180);
      assert(d.getElementById('home-main').style.transform.includes('scale(2.5, 2.5)'), 'Back restores the entire menu');
      h.frame(180);
    }
    assert.equal(home.dataset.view, 'main'); assert(scene.hidden);
  }
  w.triBuildLevels(Array.from({ length: 12 }, (_, i) => 'Level ' + i));
  h.click('select-level'); h.frame(360);
  const levels = d.getElementById('home-levels');
  assert.equal(+levels.dataset.rows, 6, 'additional levels add enough complete rows');
  const positions = [...levels.querySelectorAll('button')].map(b => b.style.getPropertyValue('--x') + '/' + b.style.getPropertyValue('--y'));
  assert.equal(new Set(positions).size, 13, 'every level and back button has its own cell');
  h.close();
}
console.log('PASS: submenu zoom endpoints/midpoint/reverse, input guard, back tips, wave flashes, row growth and reduced motion.');

// Check visible flashes against the actual shared-edge order, including the
// upward fillers that touch the next row along an edge (not just a corner).
{
  const h = harness(source, 'https://tri.test/', {}, { reducedMotion: false });
  h.w.triShowHome(); h.frame();
  const scene = h.d.getElementById('home-main');
  const expected = [
    [scene.querySelector('.home-credit')],
    [...scene.querySelectorAll('.home-up[data-row="2"]')],
    ['create-puzzle', 'load-puzzle'].map(id => h.d.getElementById(id)),
    [...scene.querySelectorAll('.home-up[data-row="1"]')],
    ['new-game', 'select-level', 'endless-mode'].map(id => h.d.getElementById(id)),
    [scene.querySelector('.home-banner')],
  ];
  assert.deepEqual(expected.map(cells => cells.length), [1, 1, 2, 2, 3, 1]);
  for (let step = 0; step <= expected.length * 2; step++) {
    const active = [...scene.querySelectorAll('[data-row]')]
      .filter(cell => +cell.style.getPropertyValue('--row-glow') > 0);
    assert.deepEqual(new Set(active), new Set(expected[step % expected.length]),
      `shared-edge wave ${step}, including wraparound`);
    for (const cell of active) {
      const base = h.d.documentElement.style.getPropertyValue(cell.classList.contains('home-banner') ? '--cell' : '--empty');
      const glow = +cell.style.getPropertyValue('--row-glow');
      const fill = cell.style.getPropertyValue('--flash-fill');
      assert.equal(fill, palette.flash(base, step, glow), 'menu wave follows ROYGBIV, including violet across loops');
      assert(palette.contrast(fill, cell.style.getPropertyValue('--row-ink')) >= 4.5);
    }
    // Advance just past the next half-second boundary to avoid float rounding.
    for (let i = 0; i < 5; i++) h.frame(100);
    h.frame(1);
  }
  h.close();
}
console.log('PASS: tip-first shared-edge flash sequence, upward fillers and wraparound.');
