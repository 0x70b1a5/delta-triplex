const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
// Return home from an Endless puzzle and pick another difficulty before the
// browser delivers the history move. That move also clears the #endless hash;
// its late arrival must not close the puzzle that just opened.
(async () => {
  const h = harness(source);
  const { d, w } = h;
  const home = d.getElementById('home');
  w.triShowHome(); h.frame();
  h.click('endless-mode');
  d.querySelector('#difficulties button[data-difficulty="0"]').click();
  await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === 0);
  assert.equal(w.location.hash, '#endless=easy-1', 'playing Endless publishes its number');
  for (const [difficulty, slug] of [[1, 'medium'], [3, 'impossible']]) {
    h.click('return-home'); h.click('endless-mode');
    d.querySelector(`#difficulties button[data-difficulty="${difficulty}"]`).click();
    assert(home.hidden, 'the numbered puzzle opens at once');
    // jsdom's real-time history traversal lands after the puzzle opened.
    await new Promise(resolve => setTimeout(resolve, 30));
    assert(home.hidden && w.triEndlessRun?.difficulty === difficulty, 'the stale history move leaves the new puzzle alone');
    assert.equal(w.location.hash, `#endless=${slug}-1`);
  }
  // A link opened by hand still works while on the menu.
  h.click('return-home');
  await new Promise(resolve => setTimeout(resolve, 30));
  w.location.hash = '#level=1';
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(h.state.level, 1); assert(home.hidden);
  h.close();
  console.log('PASS: fast clicks past a pending Back, stale hash cleanup ignored, typed links still open.');
})().catch(error => { console.error(error); process.exit(1); });
