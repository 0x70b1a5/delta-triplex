"use strict";
// Three opaque, overlapping shutter panels. Their lattices slide independently;
// the clipping edges stay crisp and never blend the grids together.
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const home = el('home');
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'menu-background';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  home.prepend(svg);
  function node(tag, attrs, parent) {
    const item = document.createElementNS(ns, tag);
    for (const [key,value] of Object.entries(attrs)) item.setAttribute(key,value);
    parent.append(item); return item;
  }
  const defs = node('defs', {}, svg), panels = [];
  for (let i=0;i<3;i++) {
    const pattern = node('pattern', { id:`menu-lattice-${i}`, patternUnits:'userSpaceOnUse' }, defs);
    const lines = node('path', { fill:'none', stroke:'var(--empty)', 'stroke-width':1 }, pattern);
    const clip = node('clipPath', { id:`menu-shutter-${i}`, clipPathUnits:'userSpaceOnUse' }, defs);
    const edge = node('polygon', {}, clip);
    const group = node('g', { 'clip-path':`url(#menu-shutter-${i})`, 'data-menu-field':i }, svg);
    // A solid backing obscures the adjacent grid wherever panels overlap.
    const backing = node('rect', { fill:'var(--bg)' }, group);
    const grid = node('rect', { fill:`url(#menu-lattice-${i})` }, group);
    panels.push({ pattern,lines,edge,backing,grid });
  }
  let directions = [], shape = '', seconds = 0;
  function drift() {
    panels.forEach((panel,i) => {
      const [x,y] = directions[i];
      const phase = seconds * 15;
      panel.pattern.setAttribute('patternTransform', `translate(${x*phase} ${y*phase})`);
    });
  }
  window.triMenuBackground = (time = seconds) => {
    seconds = time;
    const rect = home.getBoundingClientRect();
    const width = rect.width || window.innerWidth, height = rect.height || window.innerHeight;
    const selected = el('home-' + home.dataset.view);
    const scene = selected?.matches('.home-triangle') ? selected : home.querySelector('.home-triangle');
    const menu = scene?.getBoundingClientRect();
    const style = scene ? getComputedStyle(scene) : null;
    const menuWidth = scene?.offsetWidth || parseFloat(style?.width) || menu?.width || width*.96;
    const menuHeight = scene?.offsetHeight || parseFloat(style?.height) || menu?.height || height;
    const menuLeft = (width-menuWidth)/2, menuTop = scene?.offsetTop || parseFloat(style?.top) || 24;
    const ratio = menuWidth && menuHeight ? menuHeight/menuWidth : Math.sqrt(3)/2;
    // Lattice size follows the main menu so submenus with more rows (the
    // calendar) don't shrink the backdrop when they open.
    const rows = +el('home-main').dataset.rows || 4;
    const nextShape = `${width}/${height}/${menuWidth}/${menuHeight}/${menuTop}/${rows}`;
    if (shape !== nextShape) {
      shape = nextShape;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      // Two lattice triangles per menu cell: the same slope and a shared
      // origin make the grid register with the menu instead of floating on an
      // unrelated 76-pixel tile with arbitrary per-panel phase offsets.
      const side = menuWidth/(rows*2), rise = side*ratio;
      // Field order is top, bottom right, bottom left.
      directions = [[-1,0],[.5,-ratio],[.5,ratio]].map(([x,y]) => {
        const length = Math.hypot(x,y); return [x/length,y/length];
      });
      // Anchor each half-plane to an actual menu edge, so the aperture and
      // all three seams register with the menu rather than an arbitrary inset.
      const normals = [[0,-1],[ratio,.5],[-ratio,.5]];
      const reach = Math.hypot(width,height)*3;
      const anchors = [[menuLeft,menuTop],[menuLeft+menuWidth,menuTop],[menuLeft,menuTop]];
      panels.forEach((panel,i) => {
        const length = Math.hypot(...normals[i]);
        const [nx,ny] = normals[i].map(v=>v/length), tx=-ny, ty=nx;
        const [ax,ay] = anchors[i];
        const points = [[-reach,0],[reach,0],[reach,reach],[-reach,reach]]
          .map(([along,out]) => [ax+tx*along+nx*out,ay+ty*along+ny*out]);
        panel.edge.setAttribute('points',points.map(p=>p.join(',')).join(' '));
        panel.pattern.setAttribute('x',menuLeft);
        panel.pattern.setAttribute('y',menuTop);
        panel.pattern.setAttribute('width',side);
        panel.pattern.setAttribute('height',rise*2);
        panel.lines.setAttribute('d', `M0 0H${side}M0 ${rise}H${side}M0 ${rise*2}H${side}M0 0L${side} ${rise*2}M${-side/2} ${rise}L${side/2} ${rise*3}M${side/2} ${-rise}L${side*1.5} ${rise}M${side} 0L0 ${rise*2}M${side*1.5} ${rise}L${side/2} ${rise*3}M${side/2} ${-rise}L${-side/2} ${rise}`);
        for (const rect of [panel.backing,panel.grid]) {
          rect.setAttribute('width',width); rect.setAttribute('height',height);
        }
      });
    }
    drift();
  };
})();
