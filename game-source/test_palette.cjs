const assert=require('assert'),P=require('./palette.js');
let seed=17;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let i=0;i<2000;i++){
 const p=P.random(random),t=P.theme(p);
 assert(P.contrast(p.bg,p.cell)>=9);
 assert(P.contrast(t.bg,t.empty)>=3);
 assert(P.contrast(t.empty,t.cell)>=2.8);
 for(const background of [t.bg,t.surface,t.hover]){
  assert(P.contrast(t.ink,background)>=4.5);
  for(const name of ['a','b','c','mint'])assert(P.contrast(t[name],background)>=4.5);
 }
}
for(const bg of ['#000000','#ffffff','#808080','#ff0000'])for(const cell of ['#000000','#ffffff','#808080','#00ff00']){
 const t=P.theme({bg,cell});for(const color of Object.values(t))assert(/^#[0-9a-f]{6}$/.test(color));
}
console.log('PASS: 2,000 seeded palettes: filled/background >=9:1, empty/background >=3:1, filled/empty >=2.8:1, interface text >=4.5:1; manual extreme colours remain valid.');
