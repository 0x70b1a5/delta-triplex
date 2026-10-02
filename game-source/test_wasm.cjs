const fs=require('fs'),assert=require('assert');const html=fs.readFileSync(require('path').join(__dirname,fs.existsSync(require('path').join(__dirname,'web/index.html'))?'web/index.html':'../public/game.html'),'utf8');const m=new WebAssembly.Module(Buffer.from(html.match(/AGFzb[A-Za-z0-9+/=]+/)[0],'base64'));let x,state,saved;const imports={};for(const i of WebAssembly.Module.imports(m)){imports[i.module]??={};imports[i.module][i.name]=()=>0}
imports.env.deliver_state=p=>{const bytes=new Uint8Array(x.memory.buffer);state=JSON.parse(new TextDecoder().decode(bytes.subarray(p,bytes.indexOf(0,p))))};
imports.env.store_text=(key,p)=>{const bytes=new Uint8Array(x.memory.buffer),decode=p=>new TextDecoder().decode(bytes.subarray(p,bytes.indexOf(0,p)));if(decode(key)==='tri-rotate-progress-v1')saved=decode(p)};
x=new WebAssembly.Instance(m,imports).exports;x.__wasm_call_ctors();x.game_skip();x.game_resize(900,760);assert.equal(state.n,4);
// Tile zero is the bottom tip. Obtain its centroid from the source geometry.
const half=Math.min((900-96)/2,(760-144)/Math.sqrt(3)),d=half/state.n,h=half*Math.sqrt(3);const px=450,py=(760-h)/2+h-d*Math.sqrt(3)*2/3;const value=()=>Number(saved[1]);
function tap(tool=1){x.game_clear_effects();x.game_down(px,py,tool);x.game_up();return !!x.game_effects(10000)}
assert.equal(value(),0);assert(tap());assert.equal(value(),1);assert(!tap());assert.equal(value(),2);assert(!tap());assert.equal(value(),0);assert(!tap(2));assert.equal(value(),2);assert(!tap(2));assert.equal(value(),0);assert(tap());x.game_undo();assert.equal(value(),0);x.game_motion(0);assert(!tap());assert.equal(value(),1);
console.log('PASS: actual compiled WASM tap cycle, fill-only ripple, right-click cross/clear, undo, reduced motion.');
// Auto-cross: off by default; when on, a stroke that meets a line's clue crosses
// that line's unknown cells, and one undo reverts the stroke with its crosses.
{
  // Size 2 with the tip and far corner filled: filling the tip alone meets its row's clue.
  const bytes=s=>{const p=x.malloc(s.length+1);new Uint8Array(x.memory.buffer).set([...Buffer.from(s),0],p);return p};
  x.game_motion(1);x.game_custom(2,0,bytes('1001'),0);x.game_visible_axes(7);
  const d2=half/2,tipY=(760-h)/2+h-d2*Math.sqrt(3)*2/3,tip=()=>{x.game_down(px,tipY,1);x.game_up()};
  const line=(c,a)=>a===0?c.i:a===1?c.j:state.n-1-c.i-c.j-c.o;
  const unresolved=()=>state.cells.some(c=>c.active&&c.state===0&&[0,1,2].some(a=>state.clues[a][line(c,a)].match));
  tip();assert.equal(state.cells[0].state,1);assert(!state.cells.some(c=>c.state===2),'auto-cross stays off by default');
  x.game_undo();x.game_auto_cross(1);
  assert(!unresolved(),'enabling crosses any line already met');
  x.game_undo();assert(state.cells.every(c=>c.state===0),'enabling is one undoable step');
  tip();assert.equal(state.cells[0].state,1);assert(!unresolved(),'a stroke meeting a clue crosses the rest of its line');
  assert(!state.won&&state.cells.some(c=>c.state===2));
  x.game_undo();assert.equal(state.cells[0].state,0);assert.equal(state.cells.filter(c=>c.state===2).length,0,'undo removes the stroke with its crosses');
  // Only clue sides on screen count: a hidden clue must not decide any cross.
  const visible=mask=>a=>mask>>a&1;
  const held=(mask,c)=>[0,1,2].some(a=>visible(mask)(a)&&state.clues[a][line(c,a)].match);
  for(const hidden of [0,1,2]){
    const mask=7&~(1<<hidden);
    x.game_auto_cross(0);x.game_reset();x.game_visible_axes(mask);x.game_auto_cross(1);tip();
    assert(state.cells.filter(c=>c.state===2).every(c=>held(mask,c)),`axis ${hidden} hidden: every cross is held by a visible met line`);
    assert(!state.cells.some(c=>c.active&&c.state===0&&held(mask,c)),`axis ${hidden} hidden: visible met lines are crossed`);
    const before=state.history;x.game_visible_axes(7);
    assert(!unresolved(),'showing a side applies its met lines');
    if(state.history>before){x.game_undo();assert.equal(state.history,before,'showing a side is one undoable step');}
  }
  x.game_auto_cross(0);x.game_reset();x.game_visible_axes(7);x.game_auto_cross(1);
  x.game_editing(1);x.game_auto_cross(1);assert(!state.cells.some(c=>c.state===2),'the editor never auto-crosses');
  x.game_auto_cross(0);x.game_skip();
}
console.log('PASS: opt-in auto-cross of met lines on visible sides only, undone with its stroke, applied on enable or reveal, never while editing.');
