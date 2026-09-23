const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
// Return home from an Endless puzzle and pick another difficulty before the
// browser delivers the history move. That move also clears the #seed hash;
// its late hashchange must not cancel the new generation.
(async () => {
  const h = harness(source);
  const { d, w } = h;
  const home = d.getElementById('home');
  w.triShowHome(); h.frame();
  h.click('endless-mode');
  d.querySelector('#difficulties button[data-difficulty="0"]').click();
  await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === 0);
  assert(w.location.hash.startsWith('#seed='), 'playing Endless publishes its seed');
  for (const difficulty of [1, 3]) {
    h.click('return-home'); h.click('endless-mode');
    d.querySelector(`#difficulties button[data-difficulty="${difficulty}"]`).click();
    // Generation yields on the harness clock, so it is still pending while
    // jsdom's real-time history traversal lands.
    assert.equal(d.getElementById('difficulties').getAttribute('aria-busy'), 'true');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert(!home.hidden && home.dataset.view === 'endless', 'the stale history move leaves the Endless menu alone');
    await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === difficulty);
    assert(home.hidden, 'the new puzzle opens');
  }
  // A link opened by hand still works while on the menu.
  h.click('return-home');
  await new Promise(resolve => setTimeout(resolve, 30));
  w.location.hash = '#level=1';
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(h.state.level, 1); assert(home.hidden);
  h.close();
  console.log('PASS: fast clicks past a pending Back, hash cleanup ignored, typed links still open.');
})().catch(error => { console.error(error); process.exit(1); });
