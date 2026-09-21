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
  assert.equal(h.d.querySelectorAll('#home-main button').length, 7);
  assert.equal(h.d.querySelector('.home-credit').href, 'https://lovecrypt.itch.io/');
  h.click('past-puzzles'); assert.equal(home.dataset.view, 'calendar');
  h.click('home-back'); assert.equal(home.dataset.view, 'main');
  h.click('endless-mode'); assert.equal(home.dataset.view, 'endless');
  h.click('home-back'); h.click('how-to-play');
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
  for (const name of ['main', 'endless']) {
    const scene = d.getElementById('home-' + name);
    scene.getBoundingClientRect = () => sceneRect(scene);
  }
  for (const id of ['endless-mode']) {
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
  for (const view of ['endless']) {
    h.click('endless-mode');
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
  for (let i = 0; i < 7; i++) { const button = d.createElement('button'); button.textContent = 'Extra ' + i; d.getElementById('difficulties').append(button); }
  h.click('endless-mode'); h.frame(360);
  const levels = d.getElementById('home-endless');
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
    ['today-puzzle', 'how-to-play', 'endless-mode'].map(id => h.d.getElementById(id)),
    [scene.querySelector('.home-banner')],
  ];
  assert.deepEqual(expected.map(cells => cells.length), [1, 1, 2, 2, 3, 1]);
  for (let step = 0; step <= expected.length * 2; step++) {
    const active = [...scene.querySelectorAll('[data-row]')]
      .filter(cell => +cell.style.getPropertyValue('--row-glow') > 0);
    assert.deepEqual(new Set(active), new Set(expected[step % expected.length]),
      `shared-edge wave ${step}, including wraparound`);
    for (const cell of active) {
      const base = cell.classList.contains('home-up') ? h.d.getElementById('home').style.getPropertyValue('--home-dim') : h.d.documentElement.style.getPropertyValue(cell.classList.contains('home-banner') ? '--cell' : '--empty');
      const glow = +cell.style.getPropertyValue('--row-glow');
      const fill = cell.style.getPropertyValue('--flash-fill');
      assert.equal(fill, palette.flash(base, step, glow), 'menu wave follows ROYGBIV, including violet across loops');
      assert(palette.contrast(fill, cell.style.getPropertyValue('--row-ink')) >= 4.5);
    }
    for (const cell of h.d.querySelectorAll('#home-endless .home-up')) {
      const glow = +cell.style.getPropertyValue('--row-glow');
      if (glow > 0) assert.equal(cell.style.getPropertyValue('--flash-fill'),
        palette.flash(h.d.getElementById('home').style.getPropertyValue('--home-dim'), step, glow),
        'Endless upward cells flash from the same double-dim base');
    }
    // Advance just past the next half-second boundary to avoid float rounding.
    for (let i = 0; i < 5; i++) h.frame(100);
    h.frame(1);
  }
  h.close();
}
console.log('PASS: tip-first shared-edge flash sequence, upward fillers and wraparound.');

// Shared shutter backdrop: three opaque clipped fields, independent movement,
// and no decorative animation when motion is reduced or play is open.
for (const reducedMotion of [false,true]) {
  const h=harness(source,'https://tri.test/',{}, {reducedMotion});
  const backdrop=h.d.getElementById('menu-background');
  assert.equal(backdrop.getAttribute('aria-hidden'),'true');
  const fields=[...backdrop.querySelectorAll('[data-menu-field]')];
  assert.equal(fields.length,3);
  for(const field of fields) {
    assert(field.getAttribute('clip-path'));
    assert.equal(field.children[0].getAttribute('fill'),'var(--bg)');
    assert(field.children[1].getAttribute('fill').startsWith('url(#menu-lattice-'));
  }
  const transforms=()=>[...backdrop.querySelectorAll('pattern')].map(p=>p.getAttribute('patternTransform'));
  const before=transforms(); h.frame(50);h.frame(50);
  if(reducedMotion)assert.deepEqual(transforms(),before);
  else for(let i=0;i<3;i++)assert.notEqual(transforms()[i],before[i]);
  for(const path of backdrop.querySelectorAll('pattern path')) assert.equal(path.getAttribute('stroke'),'var(--empty)');
  const main=h.d.getElementById('home-main');
  Object.defineProperties(main,{offsetWidth:{value:600},offsetHeight:{value:500},offsetTop:{value:30}});
  h.w.triMenuBackground(10);
  const positions=()=>transforms().map(t=>t.match(/translate\(([^)]+)\)/)[1].split(' ').map(Number));
  const start=positions(); h.w.triMenuBackground(11);
  positions().forEach((p,i)=>assert(Math.abs(Math.hypot(p[0]-start[i][0],p[1]-start[i][1])-15)<1e-6,'fivefold drift: 15 pixels per second'));
  const travel=positions().map((p,i)=>p.map((v,axis)=>v-start[i][axis]));
  assert(travel[0][0]<0 && travel[0][1]===0,'top field travels left');
  assert(travel[1][0]>0 && travel[1][1]<0,'bottom-right field travels up and right');
  assert(travel[2][0]>0 && travel[2][1]>0,'bottom-left field follows its menu edge down and right');
  const width=+backdrop.getAttribute('viewBox').split(' ')[2], left=(width-600)/2;
  const edges=[[[left,30],[left+600,30]],[[left+600,30],[left+300,530]],[[left,30],[left+300,530]]];
  for(const pattern of backdrop.querySelectorAll('pattern')) {
    assert.equal(+pattern.getAttribute('x'),left,'lattice shares the menu origin');
    assert.equal(+pattern.getAttribute('y'),30);
    const tileWidth=+pattern.getAttribute('width'),tileHeight=+pattern.getAttribute('height');
    assert(Math.abs(tileHeight/tileWidth-2*500/600)<1e-6,'diagonal grid lines match menu edge slopes');
    assert.equal(tileWidth*2*(+main.dataset.rows),600,'two grid subdivisions per menu cell');
  }
  [...backdrop.querySelectorAll('clipPath polygon')].forEach((polygon,i)=>{
    const [a,b]=polygon.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));
    for(const p of edges[i])assert(Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<1e-5,'field boundary lies on the menu edge');
  });
  h.click('past-puzzles');assert(!h.d.getElementById('home').hidden);
  assert.equal(h.d.querySelectorAll('#menu-background').length,1);
  h.startPuzzle();const paused=transforms();h.frame(100);assert.deepEqual(transforms(),paused);
  h.close();
}
console.log('PASS: opaque three-field menu backdrop, shared archive background, independent drift and motion pause.');

{
  const h=harness(source), {d,w}=h, get=id=>d.getElementById(id);
  const settings=get('home-settings');
  assert(settings.classList.contains('home-up'));
  assert.equal(settings.style.getPropertyValue('--x'),'25%');
  const initial=JSON.stringify(h.state);
  h.click('home-settings');
  assert(!get('puzzle-menu').hidden && get('home').inert);
  for(const id of ['return-home','menu-create','editor-settings'])assert(get(id).hidden,id+' is hidden from home');
  for(const id of ['return-home','editor-open','editor-name','editor-size','editor-export','editor-json','editor-share'])assert(get(id).disabled,id+' is unavailable from home');
  for(const id of ['theme-mode','background-color','cell-color','sound-master','sound-music','sound-sfx'])assert(!get(id).disabled,id+' remains available');
  h.click('editor-open');assert.equal(JSON.stringify(h.state),initial);
  get('theme-mode').value='dark';get('theme-mode').dispatchEvent(new w.Event('change'));
  assert(!get('puzzle-menu').hidden);
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));h.frame();
  assert(get('puzzle-menu').hidden && !get('home').inert);
  assert.equal(d.activeElement,settings);
  assert(!get('editor-open').disabled && !get('return-home').disabled);
  assert(!get('menu-create').hidden && !get('return-home').hidden);
  h.startPuzzle();h.click('menu-toggle');
  assert(!get('return-home').disabled && !get('editor-open').disabled);
  h.click('menu-close');h.click('return-home');h.click('home-settings');h.click('menu-close');
  assert(!get('home').inert);
  h.close();
}
console.log('PASS: upward Settings entry, home-only hidden sections, live appearance/sound controls and restored game menu.');
