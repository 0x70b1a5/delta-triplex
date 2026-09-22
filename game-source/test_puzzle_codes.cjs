const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
(async () => {
  const h = harness(source), { w, d } = h;
  const share = w.TriShare;
  const all = new Set();
  for (let difficulty = 0; difficulty < 5; difficulty++) for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
    const code = share.seedCode(seed, difficulty);
    assert(!all.has(code)); all.add(code);
    assert.deepEqual(share.parseSeedCode(code), { seed, difficulty });
    assert.deepEqual(share.parseSeedCode('  ' + code.toLowerCase().replace('-', ' ') + ' '), { seed, difficulty });
  }
  assert.deepEqual(share.parseSeedCode('OOO-OOOL'), { seed: 1, difficulty: 0 });
  for (const code of ['', '1234', '12345678', 'M00-0000', 'ZZZ-ZZZZ', '000-000U', '<script>']) assert.throws(() => share.parseSeedCode(code));
  assert.equal(share.seedCode(0, 5), ''); assert.equal(share.seedCode(0, -1), '');
  h.click('endless-mode');
  d.querySelector('[data-difficulty="4"]').click();
  await h.settle(() => h.state.custom && w.triEndlessRun?.difficulty === 4);
  const original = JSON.stringify(h.state.solution);
  const code = d.getElementById('session-seed').textContent.replace(/^Code /, '');
  let copied;
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
  h.click('session-seed'); await Promise.resolve();
  assert.equal(copied, code, 'clicking the timer code copies the entire puzzle identity');
  const puzzle = share.seedPuzzle(code), url = share.url(puzzle);
  assert(url.endsWith('#seed=' + code)); assert(!url.includes('difficulty'));
  for (const text of [code.toLowerCase(), url, '#seed=' + code]) assert.equal(JSON.stringify(share.fromText(text).solution), original);
  // Modal input pauses play; cancellation and validation preserve the board.
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('unavailable'); } } });
  h.click('session-seed'); await new Promise(resolve => setImmediate(resolve));
  const dialog = d.getElementById('load-dialog'), input = d.getElementById('puzzle-code');
  assert(dialog.open); assert.equal(input.value, code);
  const elapsed = w.TriRotation.stats.elapsed;
  h.advance(1000); assert.equal(w.TriRotation.stats.elapsed, elapsed);
  dialog.dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert(!dialog.open); assert(!d.getElementById('app').inert);
  h.click('return-home'); h.click('load-puzzle');
  input.value = 'not valid';
  d.getElementById('load-code-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert(dialog.open); assert(!d.getElementById('load-code-error').hidden);
  assert.equal(JSON.stringify(h.state.solution), original);
  input.value = code.toLowerCase();
  d.getElementById('load-code-form').dispatchEvent(new w.Event('submit', { cancelable: true })); h.frame();
  assert(!dialog.open); assert(d.getElementById('home').hidden);
  assert.equal(JSON.stringify(h.state.solution), original);
  assert.equal(h.state.n, 3);
  assert.equal(d.getElementById('session-seed').textContent, 'Code ' + code);
  const imported = { size: 2, solution: [1, 0, 1, 0] };
  assert.deepEqual(share.fromText(share.url(imported)).solution, imported.solution, 'packed custom links still open');
  h.click('return-home'); h.click('load-puzzle'); h.click('load-json-file');
  assert(!dialog.open, 'JSON import remains available alongside code input');
  const palette = require('./palette.js');
  const packed = { format: 'tri-logic', version: 2, cellOrder: 'north-row-major', name: 'Secret', size: 3, solution: [1, 1, 0, 0, 1, 0, 0, 0, 1] };
  const packedUrl = 'https://tri.test/' + new URL(share.url(packed)).hash;
  const sproutCode = share.seedCode(1, 4);
  h.close();

  const visitor = harness(source, packedUrl, {}, { reducedMotion: false });
  const { w: vw, d: vd } = visitor;
  const help = vd.getElementById('share-help');
  const board = vd.getElementById('rotate-board');
  board.setPointerCapture = () => {};
  assert(vd.getElementById('home').hidden, 'a shared link opens the puzzle');
  assert(vd.getElementById('editor-test').hidden, 'a shared link has no Edit control');
  assert.equal(visitor.state.editing, false);
  assert(visitor.state.cells.every(cell => !cell.active || cell.state === 0), 'the solution is not painted for the visitor');
  visitor.click('editor-test');
  assert.equal(visitor.state.editing, false, 'Edit cannot be invoked from a shared link');
  assert(visitor.state.cells.every(cell => !cell.active || cell.state === 0));
  assert.equal(help.hidden, false);
  assert.equal(help.textContent, 'How to Play');
  assert.equal(help.parentElement.id, 'bottom-controls');
  assert(help.compareDocumentPosition(vd.getElementById('undo')) & 4, 'How to Play is the bottom-left control');
  const css = [...vd.querySelectorAll('style')].map(node => node.textContent).join('\n');
  assert(css.includes('#share-help{') || css.includes('#share-help {'), 'How to Play is positioned in the footer');
  assert(css.includes('margin-right:auto') || css.includes('margin-right: auto'), 'How to Play stays at the bottom left');
  const firstFill = help.style.getPropertyValue('--next-fill');
  assert(palette.contrast(firstFill, help.style.getPropertyValue('--next-ink')) >= 4.5, 'How to Play keeps readable contrast while it cycles');
  visitor.frame(400);
  assert.notEqual(help.style.getPropertyValue('--next-fill'), firstFill, 'How to Play cycles hues before the first move');
  const target = board.querySelector('[data-cell="0"]');
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new vw.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 180, clientY: 180 });
    (type === 'pointerdown' ? target : board).dispatchEvent(event);
    visitor.frame();
  }
  assert.equal(help.style.getPropertyValue('--next-fill'), '', 'the hue rests after the first mark');
  visitor.frame(400);
  assert.equal(help.style.getPropertyValue('--next-fill'), '');
  visitor.click('undo');
  assert.equal(help.style.getPropertyValue('--next-fill'), '', 'undo does not restart the hue');
  visitor.click('share-help');
  assert.equal(vd.getElementById('tutorial-intro').hidden, false);
  assert.equal(vd.getElementById('intro-exit').textContent, 'Close');
  visitor.click('intro-exit');
  assert.equal(vd.getElementById('tutorial-intro').hidden, true);
  assert.equal(vd.getElementById('home').hidden, true, 'Close returns to the shared puzzle');
  visitor.click('share-help');
  for (let step = 0; step < 3; step++) visitor.click('intro-next');
  assert.equal(vd.getElementById('intro-next').textContent, 'Back to puzzle');
  visitor.click('intro-next');
  assert.equal(vd.getElementById('tutorial-intro').hidden, true);
  assert.equal(vd.getElementById('home').hidden, true, 'closing the lesson returns to the shared puzzle');
  assert.equal(visitor.state.tutorial, -1);
  assert.equal(JSON.stringify(visitor.state.solution), JSON.stringify(packed.solution));
  for (let index = 0; index < visitor.state.cells.length; index++) {
    const cell = visitor.state.cells[index];
    const rank = cell.i + cell.j + cell.o;
    if (cell.active && visitor.state.solution[rank * rank + 2 * cell.i + cell.o] && cell.state !== 1) {
      const polygon = board.querySelector(`[data-cell="${index}"]`);
      for (const type of ['pointerdown', 'pointerup']) {
        const event = new vw.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 180, clientY: 180 });
        (type === 'pointerdown' ? polygon : board).dispatchEvent(event);
        visitor.frame();
      }
    }
  }
  assert(visitor.state.won);
  assert(help.hidden, 'How to Play steps aside once the puzzle is solved');
  visitor.click('next-puzzle');
  assert.equal(vd.getElementById('home').hidden, false, 'finishing a shared puzzle returns home');
  assert.equal(visitor.state.editing, false);
  visitor.close();

  const seeded = harness(source, 'https://tri.test/#seed=' + sproutCode);
  assert(seeded.d.getElementById('editor-test').hidden);
  assert.equal(seeded.d.getElementById('share-help').hidden, false);
  const quiet = seeded.d.getElementById('share-help').style.getPropertyValue('--next-fill');
  assert.equal(quiet, palette.oklch(.7, .16, 145), 'reduced motion keeps one How to Play accent');
  seeded.frame(500);
  assert.equal(seeded.d.getElementById('share-help').style.getPropertyValue('--next-fill'), quiet);
  seeded.d.getElementById('rotate-board').setPointerCapture = () => {};
  seeded.click('turn-right');
  assert.equal(seeded.d.getElementById('share-help').style.getPropertyValue('--next-fill'), '', 'the hue rests after the first turn');
  seeded.close();

  const author = harness(source);
  author.click('create-puzzle');
  assert.equal(author.d.getElementById('editor-test').hidden, false, 'the author still has Edit');
  assert.equal(author.d.getElementById('editor-test').textContent, 'Try');
  assert.equal(author.d.getElementById('share-help').hidden, true);
  author.click('editor-test');
  assert.equal(author.state.editing, false);
  assert.equal(author.d.getElementById('editor-test').textContent, 'Edit');
  author.click('editor-test');
  assert.equal(author.state.editing, true);
  author.close();
  console.log('PASS: complete puzzle codes, all difficulty/seed boundaries, readable input, copy/paste, modal pause, validation and JSON route.');
  console.log('PASS: shared links hide Edit, keep the solution unpainted, and cycle How to Play until the first mark.');
})().catch(error => { console.error(error); process.exitCode = 1; });
