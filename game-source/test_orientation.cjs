const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
// A crafted puzzle faces its author's chosen way: it opens there, and the
// victory spin (never less than a full turn) always lands there.
(async () => {
  const puzzle = { size: 3, solution: [1, 1, 0, 0, 1, 0, 0, 0, 1] };
  {
    const h = harness(source), share = h.w.TriShare;
    const urls = [0, 1, 2].map(orientation => share.url({ ...puzzle, orientation }));
    urls.forEach((url, orientation) => {
      const decoded = share.fromText(url);
      assert.equal(decoded.orientation, orientation, 'links carry the orientation');
      assert.deepEqual(decoded.solution, puzzle.solution);
      assert.equal(share.url(decoded), url, 'links round-trip exactly');
      assert.equal(url.length, urls[0].length, 'orientation shares the size byte, so links do not grow');
    });
    assert.throws(() => share.encode({ ...puzzle, orientation: 3 }));
    const packed = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const bits = [...atob(urls[0].split('#p=')[1].replace(/-/g, '+').replace(/_/g, '/'))].slice(2).map(c => c.charCodeAt(0));
    assert.throws(() => share.decode(packed([3, 3 | 3 << 4, ...bits])), 'orientation 3 is invalid');
    assert.throws(() => share.decode(packed([2, 3, ...bits])), 'version-2 links are retired');
    h.close();
  }

  function solve(h) {
    const board = h.d.getElementById('rotate-board');
    board.setPointerCapture = () => {};
    for (let index = 0; index < h.state.cells.length; index++) {
      const c = h.state.cells[index], r = c.i + c.j + c.o;
      if (!c.active || !h.state.solution[r * r + 2 * c.i + c.o]) continue;
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new h.w.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 200, clientY: 200 });
        (type === 'pointerdown' ? board.querySelector(`[data-cell="${index}"]`) : board).dispatchEvent(event);
        h.flush();
      }
    }
    h.click('submit-solution');
    assert(h.state.won);
  }
  const hueTurn = h => ((h.w.triPuzzleHue() % 360) + 360) % 360;
  for (const reducedMotion of [false, true]) for (const [width, height] of [[1200, 700], [390, 760]]) for (const home of [0, 1, 2]) for (const before of [0, 1, 2]) {
    const setup = harness(source); const link = setup.w.TriShare.url({ ...puzzle, orientation: home }); setup.close();
    const h = harness(source, 'https://tri.test/' + new URL(link).hash, {}, { reducedMotion });
    h.resize(width, height);
    const stats = () => h.w.TriRotation.stats, base = h.w.TriRotation.geometry.desktop ? 0 : 30;
    assert.equal(stats().view, home, 'a crafted puzzle opens facing its orientation');
    assert.equal(stats().turns, 0);
    assert.equal(hueTurn(h), 0, 'the home view shows the chosen palette');
    for (let i = 0; i < before; i++) { h.click('turn-right'); h.frame(700); }
    const turns = stats().turns;
    solve(h);
    assert.equal(stats().view, home, 'solving lands on the home view');
    assert.equal(stats().turns, turns, 'the reveal adds no turns');
    const angle = h.w.TriRotation.geometry.angle;
    assert.equal((((angle - base - home * 120) % 360) + 360) % 360, 0, 'resting geometry is the home view');
    const layer = () => h.d.querySelector('[data-board-layer]').getAttribute('transform') || '';
    if (reducedMotion) {
      assert(!h.exports.game_celebrating(), 'reduced motion snaps without a spin');
      assert.equal(hueTurn(h), 0);
    } else {
      // Starts where the player left it, then spins at least a full turn.
      const extra = [0, 120, -120][((home - (home + before) % 3) % 3 + 3) % 3];
      h.frame();
      assert(layer().includes(`rotate(${-extra}) `) || (extra === 0 && layer().includes('rotate(0) ')), 'the spin begins at the view the player left');
      assert.equal(hueTurn(h), (((before * 120) % 360) + 360) % 360, 'the palette starts where the player left it');
      h.frame(250);
      const total = extra < 0 ? extra - 360 : extra + 360;
      assert(Math.abs(total) >= 360);
      assert(layer().includes(`rotate(${315 * total / 360 - extra}) `));
      h.frame(300);
      assert(!h.exports.game_celebrating());
      assert.equal(hueTurn(h), 0, 'the palette settles on the chosen colors');
    }
    h.close();
  }

  // The author sets orientation by turning the board while editing.
  const author = harness(source);
  author.click('create-puzzle');
  author.newPuzzle();
  assert(author.state.editing);
  author.click('turn-right'); author.frame(700);
  author.click('turn-right'); author.frame(700);
  assert.equal(JSON.parse(author.w.localStorage.getItem('tri-rotate-editor-v1')).orientation, 2, 'the draft remembers the turn');
  assert.equal(author.w.TriRotation.stats.turns, 0, 'editing turns are not counted');
  author.click('editor-test');
  assert.equal(author.state.editing, false);
  assert.equal(author.w.TriRotation.stats.view, 2, 'Try opens the way players will see it');
  author.click('turn-left'); author.frame(700);
  assert.equal(JSON.parse(author.w.localStorage.getItem('tri-rotate-editor-v1')).orientation, 2, 'turning while trying does not change it');
  author.click('editor-json');
  assert.equal(JSON.parse(await author.download()).orientation, 2, 'JSON export carries the orientation');
  author.click('editor-test');
  assert.equal(author.w.TriRotation.stats.view, 2, 'editing reopens at the chosen orientation');
  author.close();
  const reopened = harness(source, 'https://tri.test/', { 'tri-rotate-editor-v1': JSON.stringify({ size: 3, solution: puzzle.solution, orientation: 1 }) });
  reopened.click('create-puzzle');
  reopened.click('new-puzzle-continue');
  assert.equal(reopened.w.TriRotation.stats.view, 1, 'a saved draft reopens facing its orientation');
  reopened.close();
  console.log('PASS: orientation in links and JSON, opens and reveals facing home on desktop and mobile, full-turn spin, palette, reduced motion and author control.');
})().catch(error => { console.error(error); process.exit(1); });
