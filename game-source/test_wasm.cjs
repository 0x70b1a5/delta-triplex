const fs=require('fs'),assert=require('assert');const html=fs.readFileSync(require('path').join(__dirname,fs.existsSync(require('path').join(__dirname,'web/index.html'))?'web/index.html':'../public/game.html'),'utf8');const m=new WebAssembly.Module(Buffer.from(html.match(/AGFzb[A-Za-z0-9+/=]+/)[0],'base64'));let x,state,saved;const imports={};for(const i of WebAssembly.Module.imports(m)){imports[i.module]??={};imports[i.module][i.name]=()=>0}
imports.env.deliver_state=p=>{const bytes=new Uint8Array(x.memory.buffer);state=JSON.parse(new TextDecoder().decode(bytes.subarray(p,bytes.indexOf(0,p))))};
imports.env.store_text=(key,p)=>{const bytes=new Uint8Array(x.memory.buffer),decode=p=>new TextDecoder().decode(bytes.subarray(p,bytes.indexOf(0,p)));if(decode(key)==='tri-logic-v1')saved=decode(p)};
x=new WebAssembly.Instance(m,imports).exports;x.__wasm_call_ctors();x.game_skip();x.game_resize(900,760);assert.equal(state.n,4);
// Tile zero is the bottom tip. Obtain its centroid from the source geometry.
const half=Math.min((900-96)/2,(760-144)/Math.sqrt(3)),d=half/state.n,h=half*Math.sqrt(3);const px=450,py=(760-h)/2+h-d*Math.sqrt(3)*2/3;const value=()=>Number(saved[1]);
function tap(tool=1){x.game_clear_effects();x.game_down(px,py,tool);x.game_up();return !!x.game_effects(10000)}
assert.equal(value(),0);assert(tap());assert.equal(value(),1);assert(!tap());assert.equal(value(),2);assert(!tap());assert.equal(value(),0);assert(!tap(2));assert.equal(value(),2);assert(!tap(2));assert.equal(value(),0);assert(tap());x.game_undo();assert.equal(value(),0);x.game_motion(0);assert(!tap());assert.equal(value(),1);
console.log('PASS: actual compiled WASM tap cycle, fill-only ripple, right-click cross/clear, undo, reduced motion.');
