// Numbered Endless puzzles end to end: the real game (WASM + DOM harness)
// against the real API (server/api.mjs) on an in-memory database.
const assert = require('assert');
const http = require('http');
const { harness, source } = require('./test_rotation_harness.cjs');

const NOW = '2026-09-20T12:00:00';
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
async function until(check, message) {
  for (let i = 0; i < 500; i++) { if (check()) return; await tick(); }
  assert.fail('timed out: ' + message);
}
function encode(n, bits) {
  const bytes = Buffer.alloc(2 + Math.ceil(n * n / 8));
  bytes[0] = 3; bytes[1] = n;
  bits.forEach((v, i) => { bytes[2 + (i >> 3)] |= v << (7 - (i & 7)); });
  return bytes.toString('base64url');
}
// Fill every solution cell by tapping it, like a player.
function solve(h) {
  const board = h.d.getElementById('rotate-board');
  board.setPointerCapture = () => {};
  h.state.cells.forEach((cell, index) => {
    const r = cell.i + cell.j + cell.o;
    if (!h.state.solution[r * r + 2 * cell.i + cell.o] || cell.state === 1) return;
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new h.w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, button: 0, pointerType: 'touch', clientX: 200, clientY: 200 });
      board.querySelector(`[data-cell="${index}"]`).dispatchEvent(event); h.frame();
    }
  });
  assert(h.state.won, 'the board is solved');
}
const storageOf = h => Object.fromEntries(Array.from({ length: h.w.localStorage.length }, (_, i) => {
  const key = h.w.localStorage.key(i); return [key, h.w.localStorage.getItem(key)];
}));
const submitForm = (h, id) => h.d.getElementById(id).dispatchEvent(new h.w.Event('submit', { cancelable: true }));

(async () => {
  const api = await import('../server/api.mjs');
  const db = api.openDatabase(':memory:');
  const bits = [1, 0, 0, 0, 1, 1, 1, 1, 1];
  api.loadDailies(db, [{ date: '2026-09-20', name: 'Mouse', code: encode(3, bits) }], Date.parse(NOW));
  const server = http.createServer(api.handler(db, { now: () => Date.parse(NOW) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return globalThis.fetch(url.replace('https://deltatriplex.com', origin), init);
  };
  const called = path => calls.filter(call => call.url.endsWith('/api/' + path));

  const h = harness(source, 'https://tri.test/', {}, { now: NOW, fetch });
  const { d, w } = h;
  // Someone else already solved Sprout #1 and #2, faster.
  for (const number of [1, 2])
    await fetch(`${origin}/api/endless/solve`, { method: 'POST', body: JSON.stringify({
      secret: 'B'.repeat(25), difficulty: 4, number, elapsedMs: 1000, turns: 0,
      filled: w.TriShare.endlessPuzzle(4, number).solution.join('') }) });

  h.click('endless-mode');
  assert.equal(d.querySelector('[data-difficulty="4"] small').textContent, '9 cells');
  assert(d.querySelector('[data-difficulty="4"] .solve-badge').hidden, 'no badge before a solve');
  d.querySelector('[data-difficulty="4"]').click();
  await until(() => h.state.custom && w.triEndlessRun?.number === 1, 'Sprout #1 opens');
  assert.equal(d.getElementById('workshop-title').textContent, 'Sprout · Puzzle 1');
  h.advance(4000);
  solve(h);
  await until(() => w.TriEndless.record('sprout-1')?.stats, 'solve submitted');
  const [submitted] = called('endless/solve').slice(-1);
  assert.deepEqual({ difficulty: submitted.body.difficulty, number: submitted.body.number }, { difficulty: 4, number: 1 });
  assert.equal(submitted.body.filled, w.TriShare.endlessPuzzle(4, 1).solution.join(''));
  assert(submitted.body.elapsedMs >= 4000);
  const toggle = d.getElementById('daily-stats-toggle');
  assert(!toggle.hidden, 'solved Endless puzzles have a Stats button');
  assert(d.getElementById('daily-stats').hidden, 'Endless stats wait to be asked for');
  toggle.click();
  const panel = d.getElementById('daily-stats');
  assert(!panel.hidden);
  assert.equal(panel.querySelector('h2').textContent, 'Endless results');
  assert.equal(panel.querySelector('.daily-stats-name').textContent, 'Sprout · Puzzle 1');
  const sections = [...panel.querySelectorAll('.daily-stats-section')].map(node => node.textContent);
  assert.deepEqual(sections, ['2 solvers so far', 'All Sprout puzzles · 3 solves']);
  assert(panel.textContent.includes('top 100%'), 'slower of two on this puzzle');
  assert.equal(panel.querySelectorAll('.daily-chart').length, 4, 'time and rotation charts for each field');
  let shared;
  Object.defineProperty(w.navigator, 'share', { configurable: true, value: async data => { shared = data; } });
  h.click('share-result'); await tick();
  assert(shared.text.startsWith('Delta Triplex · Sprout #1\n'), shared.text);
  assert.equal(shared.url, 'https://deltatriplex.com/#endless=sprout-1');
  panel.querySelector('#daily-stats-close').click();

  // Next skips to the lowest unsolved number; B's solve of #2 doesn't count here.
  h.click('next-puzzle');
  await until(() => w.triEndlessRun?.number === 2, 'Sprout #2 opens');
  assert.equal(w.location.hash, '#endless=sprout-2');
  assert(toggle.hidden, 'an unsolved puzzle has no stats yet');

  // The menu and the Solves dialog count solves, leaving out empty difficulties.
  h.click('return-home'); h.click('endless-mode');
  const badge = d.querySelector('[data-difficulty="4"] .solve-badge');
  assert.equal(d.querySelector('[data-difficulty="4"] small').textContent, '9 cells', 'the cell count keeps its own line');
  assert(!badge.hidden);
  assert.equal(badge.querySelector('[aria-hidden]').textContent, '1');
  assert.equal(badge.querySelector('.theme-sr-only').textContent, '1 solved');
  assert(d.querySelector('[data-difficulty="0"] .solve-badge').hidden, 'difficulties with no solves have no badge');
  h.click('endless-stats');
  const record = d.getElementById('endless-record');
  assert(record.open);
  assert.deepEqual([...record.querySelectorAll('li')].map(li => li.textContent), ['Sprout1']);
  assert.equal(d.getElementById('endless-record-total').textContent, '1 puzzle solved');
  record.dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert(!record.open);

  // The menu returns to the puzzle in progress.
  d.querySelector('[data-difficulty="4"]').click();
  await until(() => w.triEndlessRun?.number === 2, 'Sprout resumes at #2');

  // Reopening a solved puzzle shows its solution and the solve that counted.
  const solvedTime = w.TriEndless.record('sprout-1').solve.elapsed;
  const statsBefore = called('endless/stats').length;
  h.click('return-home'); h.click('load-puzzle');
  d.getElementById('puzzle-code').value = 'sprout 1';
  submitForm(h, 'load-code-form'); h.frame();
  assert(h.state.won, 'a solved puzzle reopens solved');
  assert.equal(w.TriRotation.stats.finished.elapsed, solvedTime);
  await until(() => called('endless/stats').length > statsBefore, 'standings refresh on reopen');
  // Reset starts a replay that never replaces the counted solve.
  h.click('reset');
  assert(!h.state.won);
  h.advance(9000); solve(h); await tick();
  assert.equal(w.TriEndless.record('sprout-1').solve.elapsed, solvedTime);
  assert.equal(called('endless/solve').length, 3, 'two seeded solves and one of ours');

  // Dailies follow the same rule: a replay in progress still reopens solved.
  await w.triOpenDaily('2026-09-20');
  await until(() => h.state.custom && w.triActiveDaily === '2026-09-20', 'daily opens');
  solve(h);
  h.click('reset');
  const board = d.getElementById('rotate-board');
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, pointerType: 'touch', clientX: 200, clientY: 200 });
    board.querySelector('[data-cell="0"]').dispatchEvent(event); h.frame();
  }
  h.click('return-home');
  await w.triOpenDaily('2026-09-20');
  assert(h.state.won, 'a solved daily reopens solved');

  // A second device adopts the sync code and learns the Endless solve.
  const player = JSON.parse(w.localStorage.getItem('tri-daily-v1')).player;
  const stored = storageOf(h);
  h.close();
  const other = harness(source, 'https://tri.test/', {}, { now: NOW, fetch });
  other.d.getElementById('sync-input').value = player;
  submitForm(other, 'sync-form');
  await until(() => other.d.getElementById('sync-status').textContent.startsWith('Synced'), 'sync');
  assert.equal(other.d.getElementById('sync-status').textContent, 'Synced · 2 solved puzzles');
  assert.equal(other.w.TriEndless.solvedCounts()[4], 1);
  other.click('endless-mode');
  other.d.querySelector('[data-difficulty="4"]').click();
  await until(() => other.w.triEndlessRun?.number === 2, 'a synced device skips the solved number');
  other.close();

  // A reload of the solved puzzle's address reopens it solved without resubmitting.
  const reloaded = harness(source, 'https://tri.test/#endless=sprout-1', stored, { now: NOW, fetch });
  assert(reloaded.state.won);
  assert.deepEqual({ ...reloaded.w.triEndlessRun }, { difficulty: 4, number: 1 });
  await tick();
  assert.equal(called('endless/solve').length, 3);
  reloaded.close();

  server.close();
  console.log('PASS: numbered Endless puzzles, first-solve submission, per-puzzle and per-difficulty stats, share text, Next skipping solved numbers, solved counts, solved reopening (Endless and daily), replay after reset and sync.');
})().catch(error => { console.error(error); process.exit(1); });
