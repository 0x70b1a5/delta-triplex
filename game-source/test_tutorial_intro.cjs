const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');
const h = harness(source, 'https://tri.test/', {}, { firstGame:true });
const { d,w }=h, get=id=>d.getElementById(id);
h.click('how-to-play');
assert(!get('tutorial-intro').hidden);
assert(!get('theme-welcome').open, 'visual introduction precedes first-play popup');
assert.equal(d.querySelectorAll('[data-demo-cell]').length,25);
assert.equal(d.querySelectorAll('[data-demo-row]').length,0);
assert.equal(get('intro-nonogram').href,'https://en.wikipedia.org/wiki/Nonogram');
h.click('intro-next');
for(let r=0;r<10;r++) {
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
assert.deepEqual(axes(),new Set(['0','2']));
h.click('intro-next');
assert(get('tutorial-intro').hidden);
assert.equal(h.state.tutorial,0);
assert(get('theme-welcome').open);
h.close();
const a=harness(source,'https://tri.test/',{}, {reducedMotion:false});
a.click('how-to-play');a.click('intro-next');a.click('intro-next');a.click('intro-next');
const first=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(16);a.frame(40);
assert.notEqual(a.d.querySelector('[data-demo-cell]').getAttribute('points'),first);
a.click('intro-exit');
const ended=a.d.querySelector('[data-demo-cell]').getAttribute('points');
a.frame(40);assert.equal(a.d.querySelector('[data-demo-cell]').getAttribute('points'),ended);
a.close();
console.log('PASS: four visual lessons, matched row hints, sound deductions, rotation, reduced motion, cleanup, and handoff.');
