const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const h = harness(source, 'https://tri.test/', {}, { firstGame:true });
const { d,w }=h, get=id=>d.getElementById(id);
const fire = (target, type, props = {}) => {
  const event = new w.Event(type, { bubbles:true, cancelable:true });
  Object.assign(event, props); target.dispatchEvent(event); h.flush();
};
const tap = target => { target.dispatchEvent(new w.MouseEvent('click', { bubbles:true })); h.flush(); };
const hints = () => Array.from(d.querySelectorAll('#intro-board .intro-hint'));
const axes = () => new Set(hints().map(n => n.dataset.axis));
const viewBox = () => get('intro-board').getAttribute('viewBox').split(' ').map(Number);
const tipOf = () => d.querySelector('[data-demo-cell="0"]').getAttribute('points').split(' ')[0].split(',').map(Number);
h.click('how-to-play');
assert(!get('tutorial-intro').hidden);
assert(!get('theme-welcome').open, 'visual introduction precedes first-play popup');
assert.equal(d.querySelectorAll('[data-demo-cell]').length,25);
assert(tipOf()[1] > 250, 'desktop triangle points down');
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
assert(tipOf()[0] > 250, 'mobile triangle points right');
w.innerWidth = 1000; w.dispatchEvent(new w.Event('resize'));
assert.equal(hints().length,0);
assert.equal(get('intro-nonogram').href,'https://en.wikipedia.org/wiki/Nonogram');
// One row of navigation: Back, Home (plus a contextual pause or replay), Next.
assert.equal(get('intro-step'), null, 'no separate step button');
assert.deepEqual(Array.from(d.querySelectorAll('.intro-navigation button'), b => b.id), ['intro-back','intro-exit','intro-pause','intro-next']);
assert(get('intro-pause').hidden, 'nothing to pause on the title page');
h.click('intro-next');
assert(get('intro-pause').hidden, 'reduced motion has no autoplay to pause');
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
const [bx,by,bw,bh] = viewBox();
assert(bw < 700, 'mobile frame fits actual content');
for (const halo of d.querySelectorAll('#intro-board .intro-halo')) {
  const x=+halo.getAttribute('cx'),y=+halo.getAttribute('cy');
  assert(x-26 >= bx && x+26 <= bx+bw && y-26 >= by && y+26 <= by+bh, 'all halos stay inside the fitted frame');
}
assert(d.querySelector('#intro-board path[data-rail]'), 'phones show the game’s column rails');
assert(d.querySelector('#intro-board linearGradient[id^="intro-clue-line-"]'), 'rail gradients never collide with the game board’s ids');
assert.deepEqual(axes(), new Set(['0','1']), 'phone lesson shows the two lesson directions');
w.innerWidth = 1000; w.dispatchEvent(new w.Event('resize'));
const fittedBox = viewBox().join(' ');
// Selecting a hint highlights exactly its row, by tap or keyboard.
for(let r=9;r>=0;r--) {
  const hint = d.querySelector(`#intro-board g[data-demo-row="${r}"]`);
  if (r % 2) tap(hint.querySelector('.intro-hit'));
  else { hint.focus(); fire(hint, 'keydown', { key:'Enter' }); }
  assert.equal(viewBox().join(' '),fittedBox, 'highlighting rows does not change scale');
  const active=d.querySelector('.intro-hint.active');
  assert.equal(+active.dataset.demoRow,r);
  assert.equal(active.getAttribute('aria-pressed'),'true');
  const expected=Array.from(w.TriIntroDemo.rows[r].ids).sort((a,b)=>a-b);
  const actual=Array.from(d.querySelectorAll('.intro-cell.emphasis'),n=>+n.dataset.demoCell).sort((a,b)=>a-b);
  assert.deepEqual(actual,expected);
  assert(get('intro-step-text').textContent.includes(`Row ${Math.floor(r/2)+1}, going ${r%2 ? 'up and left' : 'up and right'}`));
  if (r % 2 === 0) assert.equal(d.activeElement?.dataset.demoRow, String(r), 'keyboard focus survives the redraw');
}
h.click('intro-next');
assert(Array.from(d.querySelectorAll('[data-demo-cell]')).every(n=>n.dataset.mark==='0'));
// Independently enumerate every possible row pattern. Each demonstrated mark must
// hold in every pattern consistent with its clues and previously known marks.
const known=Array(25).fill(0);
w.TriIntroDemo.steps.forEach((step, index) => {
  const row=w.TriIntroDemo.rows[step.row], candidates=[];
  for(let bits=0;bits<2**row.ids.length;bits++) {
    const pattern=Array.from(row.ids,(_,i)=>(bits>>i)&1), runs=[]; let count=0;
    for(const fill of [...pattern,0]) { if(fill)count++;else if(count){runs.push(count);count=0;} }
    if(!runs.length)runs.push(0);
    if(JSON.stringify(runs)!==JSON.stringify(row.runs))continue;
    if(row.ids.some((id,i)=>known[id] && (known[id]===1)!==!!pattern[i]))continue;
    candidates.push(pattern);
  }
  assert(candidates.length);
  for(const id of step.changed) {
    assert(candidates.every(p=>p[row.ids.indexOf(id)]===(step.value===1?1:0)), 'only logically forced marks');
    known[id]=step.value;
  }
  // Tapping anywhere on the triangle steps the solve; so does Enter on the board.
  if (index % 2) tap(d.querySelector('[data-demo-cell="12"]'));
  else fire(get('intro-board'), 'keydown', { key:'Enter' });
  for(let id=0;id<25;id++) assert.equal(d.querySelector(`[data-demo-cell="${id}"]`).dataset.mark,known[id]);
});
assert(known.every(Boolean));
assert(known.every((v,id)=>(v===1)===w.TriIntroDemo.cells[id].filled));
assert(!get('intro-pause').hidden && get('intro-pause').textContent === 'Replay', 'a finished solve offers a replay');
h.click('intro-pause');
assert(Array.from(d.querySelectorAll('[data-demo-cell]')).every(n=>n.dataset.mark==='0'), 'replay returns to the empty triangle');
h.click('intro-next');
assert.equal(get('tutorial-intro').dataset.page,'3');
assert.deepEqual(axes(),new Set(['0','1']));
const points=d.querySelector('[data-demo-cell]').getAttribute('points');
fire(get('intro-board'), 'keydown', { key:'ArrowRight' });
assert.notEqual(d.querySelector('[data-demo-cell]').getAttribute('points'),points);
assert.deepEqual(axes(),new Set(['0','2']));
// Multi-number hints step outward along their own row, as on the game board.
const multi = hints().filter(g => g.querySelectorAll('text').length > 1);
assert(multi.length, 'the third direction has multi-number hints');
for (const g of multi) {
  const [a,b] = Array.from(g.querySelectorAll('text'), t => [+t.getAttribute('x'), +t.getAttribute('y')]);
  const along = [b[0]-a[0], b[1]-a[1]], length = Math.hypot(...along);
  assert(Math.abs(along[1]) > length * .8, 'numerals are not laid out horizontally');
}
h.frame(500);
fire(get('intro-board'), 'wheel', { deltaY:60, deltaX:0, deltaMode:0 });
assert.deepEqual(axes(),new Set(['1','2']), 'scrolling turns the demonstration');
const board = get('intro-board');
fire(board, 'pointerdown', { pointerId:1, button:0, clientX:100, clientY:100 });
fire(board, 'pointermove', { pointerId:1, clientX:120, clientY:100 });
fire(board, 'pointerup', { pointerId:1, clientX:120, clientY:100 });
assert.deepEqual(axes(),new Set(['1','2']), 'a short drag settles back');
h.frame(500);
fire(board, 'pointerdown', { pointerId:2, button:0, clientX:100, clientY:100 });
fire(board, 'pointermove', { pointerId:2, clientX:170, clientY:100 });
assert.equal(hints().length, 0, 'hints hide while dragging');
fire(board, 'pointerup', { pointerId:2, clientX:170, clientY:100 });
assert.deepEqual(axes(),new Set(['0','1']), 'dragging turns the demonstration');
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
for (const expected of [['0','1'], ['0','2'], ['1','2']]) {
  assert(viewBox()[2] < 700, 'rotation rests at a generous mobile scale');
  assert.deepEqual(axes(),new Set(expected), 'mobile uses the same two axes relative to its bare left edge');
  // Phone hints are the game's columns: every numeral of a hint shares one x.
  const byHint = new Map();
  for (const t of d.querySelectorAll('#intro-board text[data-column]')) {
    const key = `${t.dataset.axis}:${t.dataset.row}`;
    byHint.set(key, [...(byHint.get(key) || []), +t.getAttribute('x')]);
  }
  assert.equal(byHint.size, 10);
  for (const xs of byHint.values()) assert(xs.every(x => Math.abs(x - xs[0]) < 1e-6));
  fire(board, 'keydown', { key:'ArrowRight' });
}
h.click('intro-next');
assert(get('tutorial-intro').hidden);
assert.equal(h.state.tutorial,0);
assert(get('theme-welcome').open);
h.close();

// With motion: autoplay until the player takes over.
const a=harness(source,'https://tri.test/',{}, {reducedMotion:false});
const ag = id => a.d.getElementById(id);
const runTimers = () => { const pending=[...a.timers]; a.timers.clear(); for (const [,t] of pending) t.fn(); a.flush(); };
const activeRow = () => a.d.querySelector('.intro-hint.active')?.dataset.demoRow;
a.click('how-to-play');a.click('intro-next');
assert(!ag('intro-pause').hidden && ag('intro-pause').textContent === 'Pause');
assert.equal(activeRow(),'0');
runTimers(); assert.equal(activeRow(),'1', 'rows cycle on their own');
a.d.querySelector('#intro-board g[data-demo-row="6"] .intro-hit').dispatchEvent(new a.w.MouseEvent('click', { bubbles:true })); a.flush();
assert.equal(activeRow(),'6');
assert.equal(ag('intro-pause').textContent, 'Play', 'choosing a hint pauses the cycle');
runTimers(); assert.equal(activeRow(),'6');
a.click('intro-pause'); runTimers(); assert.equal(activeRow(),'7', 'play resumes from the chosen row');
a.click('intro-next');
for (let i = 0; i < 20; i++) runTimers();
assert.equal(ag('intro-pause').textContent, 'Replay', 'the solve plays once and stops');
assert.equal(a.timers.size, 0);
a.click('intro-next');
const first=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(16);a.frame(900);
assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),first, 'rest before turning');
a.frame(900);a.frame(210);
assert.equal(a.d.querySelectorAll('#intro-board .intro-hint').length,0, 'hide hints throughout a turn');
assert.notEqual(a.d.querySelector('[data-demo-cell]').getAttribute('points'),first);
a.frame(210);a.frame(16);
assert.equal(a.d.querySelectorAll('#intro-board .intro-hint').length,10, 'show two clue sets after settling');
assert.deepEqual(new Set(Array.from(a.d.querySelectorAll('#intro-board .intro-hint'), n=>n.dataset.axis)),new Set(['0','2']));
const resting=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(900);
assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),resting, 'rest after a completed 120 degree turn');
a.w.innerWidth = 400; a.w.dispatchEvent(new a.w.Event('resize'));
for (let frame = 0; frame < 150; frame++) {
  a.frame(16);
  const [x,y,width,height] = ag('intro-board').getAttribute('viewBox').split(' ').map(Number);
  for (const polygon of a.d.querySelectorAll('#intro-board polygon')) for (const point of polygon.getAttribute('points').split(' ')) {
    const [px,py] = point.split(',').map(Number);
    assert(px >= x && px <= x+width && py >= y && py <= y+height, 'rotating corners remain inside the fitted frame');
  }
}
// A player's own turn stops the autoplay.
for (let i = 0; i < 40 && a.d.querySelectorAll('#intro-board .intro-hint').length === 0; i++) a.frame(16);
const e = new a.w.Event('keydown', { bubbles:true, cancelable:true }); e.key = 'ArrowLeft'; ag('intro-board').dispatchEvent(e);
for (let i = 0; i < 40; i++) a.frame(16);
const taken = a.d.querySelector('[data-demo-cell]').getAttribute('points');
assert.equal(ag('intro-pause').textContent, 'Play');
for (let i = 0; i < 10; i++) a.frame(900);
assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),taken, 'no more turns after the player takes over');
a.click('intro-exit');
const ended=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(40);assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),ended);
a.close();
console.log('PASS: four visual lessons, one navigation row, tappable hints, stepped solve and replay, game-matched clue layout, hands-on rotation, autoplay handover, and cleanup.');
