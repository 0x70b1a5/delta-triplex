// Daily puzzles end to end: the real game (WASM + DOM harness) against the real
// API (server/api.mjs) on an in-memory database.
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
function solve(h, beforeLast = () => {}) {
  const board = h.d.getElementById('rotate-board');
  board.setPointerCapture = () => {};
  const targets = h.state.cells.map((cell, index) => [cell, index])
    .filter(([cell]) => { const r = cell.i + cell.j + cell.o; return h.state.solution[r * r + 2 * cell.i + cell.o] && cell.state !== 1; });
  targets.forEach(([, index], k) => {
    if (k === targets.length - 1) beforeLast();
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

(async () => {
  const api = await import('../server/api.mjs');
  const db = api.openDatabase(':memory:');
  const bits = [1, 0, 0, 0, 1, 1, 1, 1, 1], code = encode(3, bits);
  api.loadDailies(db, [
    { date: '2026-09-19', name: 'Yesterday Once More', code },
    { date: '2026-09-20', name: 'Mouse', code },
    { date: '2026-09-25', name: 'Not Yet', code },
  ], Date.parse(NOW));
  const server = http.createServer(api.handler(db, { now: () => Date.parse(NOW) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return globalThis.fetch(url.replace('https://tri.test', origin), init);
  };
  const solveCalls = () => calls.filter(call => call.url.endsWith('/api/solve'));

  // A newcomer: the list loads, but there is no spark without a record here.
  const h = harness(source, 'https://tri.test/', {}, { now: NOW, fetch });
  const { d, w } = h;
  await until(() => w.triDailyListLoaded(), 'daily list');
  assert.equal(d.getElementById('today-puzzle').dataset.spark, 'false', 'no spark for a first visit');

  // Past Puzzles: released days with puzzles are playable; others are dim; the future stays hidden.
  h.click('past-puzzles');
  const day = n => d.querySelector(`#calendar-grid [data-day="${n}"]`);
  assert.equal(day(19).dataset.daily, 'open');
  assert.equal(day(20).dataset.daily, 'open');
  assert.equal(day(18).dataset.daily, 'none');
  assert(day(25).disabled && !day(25).dataset.daily, 'future puzzles are not listed');
  assert.equal(day(19).title, 'Yesterday Once More');
  day(19).click();
  await until(() => h.state.custom && d.getElementById('home').hidden, 'past daily opens');
  assert.equal(d.getElementById('workshop-title').textContent, 'September 19, 2026 · Yesterday Once More');
  assert.equal(w.location.hash, '#daily=2026-09-19', 'the address names the daily');
  h.advance(5000);
  h.click('return-home');
  await until(() => w.location.hash === '', 'leaving the daily clears its address');
  assert.equal(d.getElementById('today-puzzle').dataset.spark, 'true', 'a returning player sees the spark');
  assert(d.querySelector('#today-puzzle .daily-spark path'), 'the spark is drawn on the button');

  // Today's Puzzle plays today's daily; the first solve is submitted and ranked.
  h.click('today-puzzle');
  await until(() => h.state.custom && d.getElementById('home').hidden, "today's daily opens");
  assert.equal(d.getElementById('workshop-title').textContent, 'September 20, 2026 · Mouse');
  solve(h, () => h.advance(42000));
  assert(d.getElementById('daily-stats').hidden, 'results wait for the reveal');
  for (const [id, timer] of [...h.timers]) if (timer.ms === 2200) { h.timers.delete(id); timer.fn(); }
  await until(() => solveCalls().length === 1 && !d.getElementById('daily-stats').hidden
    && d.getElementById('daily-stats').textContent.includes('first to solve'), 'stats after the first solve');
  const posted = solveCalls()[0].body;
  assert.equal(posted.date, '2026-09-20');
  assert.equal(posted.filled, '100011111', 'the canonical board is sent');
  assert.equal(posted.turns, 0);
  assert(Math.abs(posted.elapsedMs - 42000) < 1000);
  assert.match(posted.secret, /^[0-9A-HJKMNP-TV-Z]{25}$/);
  assert(!d.getElementById('daily-stats-toggle').hidden);
  h.click('daily-stats-close');
  assert(d.getElementById('daily-stats').hidden);

  // Reset and solve again: the replay does not replace the counted solve.
  h.click('reset');
  solve(h);
  await tick(); await tick();
  assert.equal(solveCalls().length, 1, 'only the first solve is submitted');

  // Someone else solves it slower with more turns; reopening refreshes the standing.
  await globalThis.fetch(origin + '/api/solve', { method: 'POST', body: JSON.stringify({
    secret: 'Z'.repeat(25), date: '2026-09-20', elapsedMs: 90000, turns: 3, filled: '100011111' }) });
  h.click('return-home');
  assert.equal(d.getElementById('today-puzzle').dataset.spark, 'false', 'no spark once today is solved');
  h.click('today-puzzle');
  await until(() => h.state.won && !d.getElementById('daily-stats-toggle').hidden, 'solved daily resumes');
  h.click('daily-stats-toggle');
  await until(() => d.getElementById('daily-stats').textContent.includes('2 solvers'), 'refreshed stats');
  const stats = d.getElementById('daily-stats').textContent;
  assert(stats.includes('00:42 · top 50%'), stats);
  assert(stats.includes('0 rotations · par 2 · top 50%'), stats);
  assert.equal(d.querySelectorAll('#daily-stats .daily-bar-you').length, 2, 'both charts mark your bin');
  const charts = [...d.querySelectorAll('#daily-stats .daily-chart')];
  const texts = (chart, cls) => [...chart.querySelectorAll('.' + cls)].map(node => node.textContent);
  assert.deepEqual(texts(charts[0], 'daily-chart-title'), ['Solvers', 'Solve time'], 'time chart axes are titled');
  assert.deepEqual(texts(charts[1], 'daily-chart-title'), ['Solvers', 'Rotations to solve'], 'rotation chart axes are titled');
  assert.deepEqual(texts(charts[1], 'daily-chart-tick'), ['1', '0', '0', '3'], 'peak count, zero, and the lowest and highest rotations');
  let shared;
  w.navigator.share = async data => { shared = data; };
  h.click('share-result'); await tick();
  assert.equal(shared.text, 'Delta Triplex Sep 20 · “Mouse”\nSolved in 00:42 (top 50%) · 0 rotations (par 2)');
  assert.equal(shared.url, 'https://deltatriplex.com/#daily=2026-09-20');
  const saved = storageOf(h), player = JSON.parse(saved['tri-daily-v1']).player;
  h.close();

  // Reloading keeps the solve without submitting again.
  const reloaded = harness(source, 'https://tri.test/#daily=2026-09-20', saved, { now: NOW, fetch });
  await until(() => reloaded.state.won, 'reloaded daily link');
  await tick();
  assert.equal(solveCalls().length, 1);
  reloaded.close();

  // Another device adopts the sync code and learns the solve.
  const other = harness(source, 'https://tri.test/', {}, { now: NOW, fetch });
  other.d.getElementById('sync-input').value = player.toLowerCase().match(/.{5}/g).join(' ');
  other.d.getElementById('sync-form').dispatchEvent(new other.w.Event('submit', { cancelable: true }));
  await until(() => other.d.getElementById('sync-status').textContent.startsWith('Synced'), 'sync');
  assert.equal(other.d.getElementById('sync-status').textContent, 'Synced · 1 solved puzzle');
  other.click('past-puzzles');
  await until(() => other.d.querySelector('#calendar-grid [data-day="20"]').dataset.daily === 'solved', 'synced calendar');
  other.d.getElementById('sync-input').value = 'not a code';
  other.d.getElementById('sync-form').dispatchEvent(new other.w.Event('submit', { cancelable: true }));
  assert.equal(other.d.getElementById('sync-status').textContent, "That isn't a valid sync code.");
  // A date with no released puzzle says so instead of loading anything.
  await other.w.triOpenDaily('2026-09-25');
  assert(other.d.getElementById('calendar-status').textContent.includes('not assigned'));
  other.close();

  // Offline: Today's Puzzle falls back to the calendar with a message.
  const offline = harness(source, 'https://tri.test/', {}, { now: NOW });
  offline.click('today-puzzle');
  await until(() => offline.d.getElementById('home').dataset.view === 'calendar', 'offline fallback');
  assert.equal(offline.d.getElementById('calendar-status').textContent, "Daily puzzles need a connection. Try again when you're online.");
  offline.close();

  server.close();
  console.log('PASS: dailies from the API, calendar states, #daily= links, first-solve submission and ranking, stats charts, share text, resume without resubmitting, sync codes, spark rules and offline fallback.');
})().catch(error => { console.error(error); process.exit(1); });
