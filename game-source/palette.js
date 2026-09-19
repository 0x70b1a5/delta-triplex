"use strict";
const TriPalette = (() => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hex = values => '#' + values.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const luminance = color => rgb(color).map(v => {
    v /= 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  const ink = color => contrast(color, '#ffffff') >= contrast(color, '#000000') ? '#ffffff' : '#000000';
  const rainbow = ['#ff3030', '#ff8800', '#ffdd00', '#20c050', '#2080ff', '#643cff', '#c040ff'];
  const mix = (base, target, amount) => hex(rgb(base).map((v, i) => v + (rgb(target)[i] - v) * amount));
  function flash(base, stage, glow, mode) {
    const colorful = mode === 'colorful';
    return mix(base, colorful ? '#ffffff' : rainbow[stage % rainbow.length],
      Math.min(1, Math.max(0, glow * (colorful ? 1 : 3))));
  }
  const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  const srgb = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
  const blend = (a, b, amount) => hex(rgb(a).map((v, i) =>
    255 * srgb(linear(v / 255) * (1 - amount) + linear(rgb(b)[i] / 255) * amount)));
  function oklch(light, chroma, hue) {
    const angle = hue * Math.PI / 180;
    for (let attempt = 0; attempt < 60; attempt++, chroma *= .85) {
      const a = chroma * Math.cos(angle), b = chroma * Math.sin(angle);
      const l = (light + .3963377774*a + .2158037573*b) ** 3;
      const m = (light - .1055613458*a - .0638541728*b) ** 3;
      const s = (light - .0894841775*a - 1.291485548*b) ** 3;
      const channels = [4.0767416621*l - 3.3077115913*m + .2309699292*s,
        -1.2684380046*l + 2.6097574011*m - .3413193965*s,
        -.0041960863*l - .7034186147*m + 1.707614701*s];
      if (channels.every(v => v >= 0 && v <= 1)) return hex(channels.map(v => 255 * srgb(v)));
    }
    return hex([1, 1, 1].map(() => 255 * srgb(light ** 3)));
  }
  function random(rng = Math.random) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const hue = 360 * rng(), bg = oklch(.16 + .12*rng(), .025 + .035*rng(), hue);
      const cell = oklch(.83 + .1*rng(), .08 + .09*rng(), hue + 60 + 240*rng());
      if (contrast(bg, cell) >= 9) return { bg, cell };
    }
    return { bg: '#17212b', cell: '#a6edcf' };
  }
  function randomColor(other, rng = Math.random) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const color = oklch(.12 + .83*rng(), .03 + .17*rng(), 360*rng());
      if (contrast(other, color) >= 6) return color;
    }
    return ink(other);
  }
  function derive({bg, cell}, colorful) {
    const text = ink(bg), surface = blend(bg, text, .035), hover = blend(bg, text, .075);
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (contrast(bg, blend(bg, cell, mid)) < 3.05) low = mid; else high = mid;
    }
    const empty = blend(bg, cell, contrast(bg, cell) >= 6 ? high : .5);
    const accent = hue => {
      const color = oklch(text === '#ffffff' ? .85 : .35, .12, hue);
      return colorful && contrast(color, hover) >= 4.5 ? color : text;
    };
    return {bg, cell, empty, cross: ink(empty), ink: text, muted: blend(bg, text, .65),
      surface, hover, border: blend(bg, text, .3),
      mint: colorful && contrast(cell, hover) >= 4.5 ? cell : text,
      a: accent(240), b: accent(330), c: accent(85)};
  }
  function theme(mode = 'dark', picked = {}, colorfulBase) {
    if (mode === 'colorful' || picked.bg || picked.cell) {
      const base = mode === 'colorful' ? colorfulBase || random()
        : mode === 'dark' ? {bg: '#000000', cell: '#ffffff'} : {bg: '#ffffff', cell: '#000000'};
      return derive({...base, ...picked}, mode === 'colorful');
    }
    const dark = mode === 'dark', bg = dark ? '#000000' : '#ffffff', cell = dark ? '#ffffff' : '#000000';
    const empty = dark ? '#626262' : '#949494';
    return { bg, cell, empty, cross: ink(empty), ink: cell,
      muted: dark ? '#b0b0b0' : '#505050', surface: dark ? '#171717' : '#eeeeee',
      hover: dark ? '#303030' : '#dddddd', border: dark ? '#777777' : '#888888',
      mint: cell, a: cell, b: cell, c: cell };
  }
  return { theme, contrast, ink, rainbow, flash, mix, random, randomColor, oklch };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TriPalette;
