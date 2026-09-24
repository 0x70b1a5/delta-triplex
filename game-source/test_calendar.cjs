const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const palette = require('./palette.js');
const h = harness(source, 'https://tri.test/', {}, { now: '2026-09-20T12:00:00' });
const { d, w } = h;
assert(!d.getElementById('level-grid'), 'stock selector is retired');
assert.equal(d.getElementById('today-puzzle').textContent.replace(/\s+/g, ''), "Today'sPuzzle");
// Past Puzzles is point-down like the calendar it zooms into; Create takes the dim upward cell.
const past = d.getElementById('past-puzzles'), create = d.getElementById('create-puzzle');
assert(!past.classList.contains('home-up'));
assert.equal(past.style.getPropertyValue('--x'), '25%');
assert.equal(past.style.getPropertyValue('--y'), '50%');
assert(create.classList.contains('home-up'));
assert.equal(create.style.getPropertyValue('--x'), '37.5%');
assert.equal(create.style.getPropertyValue('--y'), '50%');
const homeStyle = d.getElementById('home').style;
assert.equal(homeStyle.getPropertyValue('--home-dim'), palette.mix(homeStyle.getPropertyValue('--bg'), homeStyle.getPropertyValue('--empty'), .25));
const initial = JSON.stringify(h.state);
// Today's Puzzle plays the daily (test_daily.cjs); the calendar opened on today is its fallback.
w.triOpenCalendar(true);
assert.equal(d.getElementById('home').dataset.view, 'calendar');
const picker = d.getElementById('calendar-month'), grid = d.getElementById('calendar-grid');
assert.equal(picker.type, 'month'); assert.equal(picker.min, '2026-09'); assert.equal(picker.max, '2026-09');
assert.equal(grid.querySelectorAll('button').length, 30);
assert.equal(grid.querySelectorAll('.calendar-unused').length, 5);
assert.equal(grid.querySelectorAll('button:disabled').length, 10, 'future days are unavailable');
assert.equal(grid.querySelector('[aria-pressed="true"]').dataset.day, '20');
assert.equal(grid.querySelector('[aria-current="date"]').dataset.day, '20');
const day = n => grid.querySelector(`[data-day="${n}"]`);
const scene = d.getElementById('home-calendar');
assert(scene.classList.contains('home-triangle'), 'calendar is a single submenu triangle');
assert.equal(scene.dataset.rows, '7');
assert.equal(day(1).dataset.row, '1'); assert.equal(day(1).style.getPropertyValue('--x'), (1 / 14 * 100) + '%');
assert(!day(1).classList.contains('home-up') && day(2).classList.contains('home-up') && !day(3).classList.contains('home-up'), 'days alternate down and up');
assert.equal(day(1).style.getPropertyValue('--y'), day(11).style.getPropertyValue('--y'));
assert(parseFloat(day(12).style.getPropertyValue('--y')) > parseFloat(day(11).style.getPropertyValue('--y')), 'day 12 starts the next row');
assert(parseFloat(day(2).style.getPropertyValue('--x')) < parseFloat(day(3).style.getPropertyValue('--x')));
assert(scene.contains(d.getElementById('home-back')), 'Back sits in the calendar tip');
assert.equal(d.getElementById('home-back').dataset.row, '6');
day(4).click();
assert.equal(grid.querySelector('[aria-pressed="true"]').dataset.day, '4');
assert(d.getElementById('calendar-status').textContent.includes('not assigned'));
assert.equal(JSON.stringify(h.state), initial, 'calendar does not load fake daily puzzles');
picker.value = '2026-08'; picker.dispatchEvent(new w.Event('change'));
assert.equal(picker.value, '2026-09');
h.click('home-back'); h.click('how-to-play');
for (let intro = 0; intro < 4; intro++) h.click('intro-next');
assert.equal(h.state.tutorial, 0);
assert(d.getElementById('home').hidden);
h.click('skip'); assert(!d.getElementById('home').hidden);
h.click('how-to-play');
for (let intro = 0; intro < 4; intro++) h.click('intro-next');
const board = d.getElementById('rotate-board'); board.setPointerCapture = () => {};
for (let tutorial = 0; tutorial < 3; tutorial++) {
  assert.equal(h.state.tutorial, tutorial);
  for (let index = 0; index < h.state.cells.length; index++) {
    const cell = h.state.cells[index], row = cell.i + cell.j + cell.o;
    if (!h.state.solution[row * row + 2 * cell.i + cell.o]) continue;
    const target = board.querySelector(`[data-cell="${index}"]`);
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, button: 0, pointerType: 'touch', clientX: 200, clientY: 200 });
      target.dispatchEvent(event); h.frame();
    }
  }
  assert(h.state.won);
  h.click('next-puzzle');
}
assert(!d.getElementById('home').hidden, 'the final tutorial returns home, never into stock levels');
// Every unsigned 32-bit seed fits in seven unambiguous Base32 characters.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
for (let difficulty = 0; difficulty < 5; difficulty++) for (const seed of [0, 1, 31, 32, 123456789, 0x80000000, 0xffffffff]) {
  const code = w.TriShare.seedCode(seed, difficulty);
  assert(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code));
  assert.equal([...code.replace('-', '')].reduce((n, c) => n * 32 + alphabet.indexOf(c), 0), difficulty * 0x100000000 + seed);
  assert.deepEqual(w.TriShare.parseSeedCode(code), { seed, difficulty });
}
assert.equal(w.TriShare.seedCode(-1), ''); assert.equal(w.TriShare.seedCode(undefined), '');
h.startPuzzle(); assert(d.getElementById('session-seed').hidden, 'unseeded puzzles do not invent a seed');
h.close();
for (const [month, days, unused] of [['2028-02', 29, 6], ['2029-02', 28, 7], ['2029-01', 31, 4]]) {
  const m = harness(source, 'https://tri.test/', {}, { now: '2030-03-20T12:00:00' });
  m.click('past-puzzles');
  const input = m.d.getElementById('calendar-month'); input.value = month; input.dispatchEvent(new m.w.Event('change'));
  assert.equal(m.d.querySelectorAll('#calendar-grid button').length, days);
  assert.equal(m.d.querySelectorAll('#calendar-grid .calendar-unused').length, unused);
  m.close();
}
console.log('PASS: daily menu, dim upward archive cell, triangular dates, month bounds/leap years, honest placeholders, tutorial and seed encoding.');
