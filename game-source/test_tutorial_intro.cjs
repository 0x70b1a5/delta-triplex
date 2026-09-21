const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const h = harness(source, 'https://tri.test/', {}, { firstGame:true });
const { d,w }=h, get=id=>d.getElementById(id);
h.click('how-to-play');
assert(!get('tutorial-intro').hidden);
assert(!get('theme-welcome').open, 'visual introduction precedes first-play popup');
assert.equal(d.querySelectorAll('[data-demo-cell]').length,25);
const tip = d.querySelector('[data-demo-cell="0"]').getAttribute('points').split(' ')[0].split(',').map(Number);
assert(tip[1] > 550, 'desktop triangle points down');
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
const mobileTip = d.querySelector('[data-demo-cell="0"]').getAttribute('points').split(' ')[0].split(',').map(Number);
assert(mobileTip[0] > 270, 'mobile triangle points right');
w.innerWidth = 1000; w.dispatchEvent(new w.Event('resize'));
assert.equal(d.querySelectorAll('[data-demo-row]').length,0);
assert.equal(get('intro-nonogram').href,'https://en.wikipedia.org/wiki/Nonogram');
h.click('intro-next');
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
const fittedBox = get('intro-board').getAttribute('viewBox');
const [bx,by,bw,bh] = fittedBox.split(' ').map(Number);
assert(bw < 500, 'mobile frame fits actual content instead of the old 690-unit padded canvas');
for (const halo of d.querySelectorAll('#intro-board ellipse')) {
  const x=+halo.getAttribute('cx'),y=+halo.getAttribute('cy');
  assert(x-26 >= bx && x+26 <= bx+bw && y-26 >= by && y+26 <= by+bh, 'all halos stay inside the fitted frame');
}
for(let r=0;r<10;r++) {
  assert.equal(get('intro-board').getAttribute('viewBox'),fittedBox, 'highlighting rows does not change scale');
  const active=d.querySelector('.intro-hint.active');
  assert.equal(+active.dataset.demoRow,r);
  const expected=Array.from(w.TriIntroDemo.rows[r].ids).sort((a,b)=>a-b);
  const actual=Array.from(d.querySelectorAll('.intro-cell.emphasis'),n=>+n.dataset.demoCell).sort((a,b)=>a-b);
  assert.deepEqual(actual,expected);
  h.click('intro-step');
}
h.click('intro-next');
assert(Array.from(d.querySelectorAll('[data-demo-cell]')).every(n=>n.dataset.mark==='0'));
// Independently enumerate every possible row pattern. Each demonstrated mark must
// hold in every pattern consistent with its clues and previously known marks.
const known=Array(25).fill(0);
for(const step of w.TriIntroDemo.steps) {
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
  h.click('intro-step');
  for(let id=0;id<25;id++) assert.equal(d.querySelector(`[data-demo-cell="${id}"]`).dataset.mark,known[id]);
}
assert(known.every(Boolean));
assert(known.every((v,id)=>(v===1)===w.TriIntroDemo.cells[id].filled));
h.click('intro-next');
assert.equal(get('tutorial-intro').dataset.page,'3');
const axes=()=>new Set(Array.from(d.querySelectorAll('#intro-board [data-axis]'),n=>n.dataset.axis));
assert.deepEqual(axes(),new Set(['0','1']));
const points=d.querySelector('[data-demo-cell]').getAttribute('points');
h.click('intro-step');
assert.notEqual(d.querySelector('[data-demo-cell]').getAttribute('points'),points);
assert.deepEqual(axes(),new Set(['1','2']));
h.click('intro-step');
assert.deepEqual(axes(),new Set(['0','2']));
h.click('intro-step');
assert.deepEqual(axes(),new Set(['0','1']));
w.innerWidth = 400; w.dispatchEvent(new w.Event('resize'));
for (const expected of [['0','1'], ['1','2'], ['0','2']]) {
  assert(+get('intro-board').getAttribute('viewBox').split(' ')[2] < 500, 'rotation rests at the same generous mobile scale as other lessons');
  assert.deepEqual(axes(),new Set(expected), 'mobile uses the same two axes relative to its bare left edge');
  for (const hint of d.querySelectorAll('#intro-board .intro-hint text')) {
    assert(Number.isFinite(+hint.getAttribute('x')) && Number.isFinite(+hint.getAttribute('y')));
  }
  h.click('intro-step');
}
h.click('intro-next');
assert(get('tutorial-intro').hidden);
assert.equal(h.state.tutorial,0);
assert(get('theme-welcome').open);
h.close();
const a=harness(source,'https://tri.test/',{}, {reducedMotion:false});
a.click('how-to-play');a.click('intro-next');a.click('intro-next');a.click('intro-next');
const first=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(16);a.frame(900);
assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),first, 'rest before turning');
a.frame(900);a.frame(210);
assert.equal(a.d.querySelectorAll('#intro-board [data-axis]').length,0, 'hide hints throughout a turn');
assert.notEqual(a.d.querySelector('[data-demo-cell]').getAttribute('points'),first);
a.frame(210);
assert.equal(a.d.querySelectorAll('#intro-board [data-axis]').length,10, 'show two clue sets after settling');
assert.deepEqual(new Set(Array.from(a.d.querySelectorAll('#intro-board [data-axis]'), n=>n.dataset.axis)),new Set(['1','2']));
const resting=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(900);
assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),resting, 'rest after a completed 120 degree turn');
a.w.innerWidth = 400; a.w.dispatchEvent(new a.w.Event('resize'));
for (let frame = 0; frame < 150; frame++) {
  a.frame(16);
  const [x,y,width,height] = a.d.getElementById('intro-board').getAttribute('viewBox').split(' ').map(Number);
  for (const polygon of a.d.querySelectorAll('#intro-board polygon')) for (const point of polygon.getAttribute('points').split(' ')) {
    const [px,py] = point.split(',').map(Number);
    assert(px >= x && px <= x+width && py >= y && py <= y+height, 'rotating corners remain inside the fitted frame');
  }
}
a.click('intro-exit');
const ended=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(40);assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),ended);
a.close();
console.log('PASS: four visual lessons, matched row hints, sound deductions, rotation, reduced motion, cleanup, and handoff.');
