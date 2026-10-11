"use strict";
// Procedural music in two layers. The outer layer is one chord progression per
// puzzle: it starts on the tonic, steps up in tension as the board fills,
// holds its most tense chord while Submit waits, and only a correct Submit
// brings it home. Each of its chords is held as a bass pedal, while the pad's
// upper chords roam around it, one note at a time, every few seconds. Each
// mark the player makes rings one chord tone in the treble that repeats as it
// fades. Everything is synthesized with Web Audio, and every note is logged so
// a solve's music can be saved as a MIDI file.
const TriMusic = (() => {
  const TRIADS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };
  // Chords by degree of the song's key. tier is tension against the tonic:
  // 0 home, 1 tonic substitutes, 2 predominants, 3 dominants. w weights the
  // pick within the rules. Borrowed chords come from the parallel minor and
  // only follow a chord they share a note with. A diminished chord's upper
  // voices roam around the triad it shares two notes with (vii° over G major
  // sounds as G/B; ii° over F minor as a half-diminished seventh).
  const CHORDS = [
    { name: "I", root: 0, quality: "maj", tier: 0, w: 0 },
    { name: "vi", root: 9, quality: "min", tier: 1, w: 4 },
    { name: "iii", root: 4, quality: "min", tier: 1, w: 3 },
    { name: "IV", root: 5, quality: "maj", tier: 2, w: 5 },
    { name: "ii", root: 2, quality: "min", tier: 2, w: 2 },
    { name: "V", root: 7, quality: "maj", tier: 3, w: 6 },
    { name: "vii°", root: 11, quality: "dim", tier: 3, w: 1, center: { root: 7, minor: false } },
    { name: "♭VI", root: 8, quality: "maj", tier: 1, w: .5, borrowed: true },
    { name: "♭III", root: 3, quality: "maj", tier: 1, w: .3, borrowed: true },
    { name: "iv", root: 5, quality: "min", tier: 2, w: .6, borrowed: true },
    { name: "ii°", root: 2, quality: "dim", tier: 2, w: .2, borrowed: true, center: { root: 5, minor: true } },
    { name: "♭II", root: 1, quality: "maj", tier: 2, w: .2, borrowed: true },
    { name: "♭VII", root: 10, quality: "maj", tier: 3, w: .6, borrowed: true },
  ];
  const chord = name => CHORDS.find(c => c.name === name);
  // beats per bar and eighths per beat; 6/8 counts two dotted quarters.
  const METERS = [
    { signature: [3, 4], beats: 3, group: 2 },
    { signature: [4, 4], beats: 4, group: 2 },
    { signature: [5, 4], beats: 5, group: 2 },
    { signature: [6, 8], beats: 2, group: 3 },
    { signature: [7, 4], beats: 7, group: 2 },
    { signature: [9, 4], beats: 9, group: 2 },
  ];
  // Triangle is too weak in the pad's bass register.
  const PAD_WAVES = ["sine", "square", "sawtooth"];
  const TINKLE_WAVES = ["sine", "square", "triangle", "sawtooth"];
  // Rough loudness matching after the low-pass filters, measured offline.
  const WAVE_GAIN = { sine: 1, triangle: .9, square: .75, sawtooth: .9 };
  // The pad's darker filter takes more from the saw.
  const PAD_GAIN = { ...WAVE_GAIN, sawtooth: 1.4 };
  // Colors added to the roaming chords, as steps above the root, by weight.
  const COLORS = [
    { name: "", w: 3, apply: (third) => [0, third, 7] },
    { name: "add9", w: 2, apply: (third) => [0, third, 7, 14] },
    { name: "7", w: 2, apply: (third) => [0, third, 7, third === 4 ? 11 : 10] },
    { name: "sus2", w: 1, apply: () => [0, 2, 7] },
    { name: "sus4", w: 1, apply: () => [0, 5, 7] },
  ];
  // How far, in one-note moves, the upper chords may roam from each stage's
  // chord: further away is part of the rising tension.
  const RADIUS = [1, 2, 2, 3];
  const STAGES = 4;
  // Each roaming chord lasts a whole number of bars, near this many seconds.
  const SPAN = [4, 8];
  const TINKLE_BEATS = 3;
  const TINKLE_VOICES = 4;
  const LOOKAHEAD = .15;

  const pick = (items, random, weight = () => 1) => {
    let roll = random() * items.reduce((sum, item) => sum + weight(item), 0);
    for (const item of items) if ((roll -= weight(item)) < 0) return item;
    return items.at(-1);
  };
  const classes = c => TRIADS[c.quality].map(step => (c.root + step) % 12);

  // The three chords after start: two that never fall in tension and stay
  // below the dominants, then a dominant, so the last change is always the
  // biggest step up. Every path is listed and one is drawn by weight.
  function progression(start, random) {
    const shares = (a, b) => classes(a).some(p => classes(b).includes(p));
    // No repeats, no swapping a chord for its same-root twin (IV, iv), and
    // no stepping back onto the starting chord.
    const follows = (prev, next) => next.root !== prev.root && next !== start && (!next.borrowed || shares(prev, next));
    const paths = [];
    for (const b of CHORDS) if (b.tier >= 1 && b.tier < 3 && follows(start, b))
      for (const c of CHORDS) if (c.tier >= b.tier && c.tier < 3 && follows(b, c))
        for (const d of CHORDS) if (d.tier === 3 && follows(c, d)) paths.push([start, b, c, d]);
    return pick(paths, random, path => path[1].w * path[2].w * path[3].w);
  }

  // ---- The roaming layer: neo-Riemannian moves --------------------------------
  // A triad is { root, minor } with an absolute pitch-class root. Each move
  // changes one note: P swaps major and minor, R goes to the relative, L moves
  // the root by a semitone (C to E minor).
  const MOVES = {
    P: t => ({ root: t.root, minor: !t.minor }),
    R: t => t.minor ? { root: (t.root + 3) % 12, minor: false } : { root: (t.root + 9) % 12, minor: true },
    L: t => t.minor ? { root: (t.root + 8) % 12, minor: false } : { root: (t.root + 4) % 12, minor: true },
  };
  const id = t => t.root + (t.minor ? 12 : 0);
  // Moves between every pair of the 24 triads.
  const DISTANCE = (() => {
    const table = [];
    for (let from = 0; from < 24; from++) {
      const row = Array(24).fill(Infinity), queue = [{ root: from % 12, minor: from >= 12 }];
      row[from] = 0;
      while (queue.length) {
        const t = queue.shift();
        for (const move of Object.values(MOVES)) {
          const next = move(t);
          if (row[id(next)] === Infinity) { row[id(next)] = row[id(t)] + 1; queue.push(next); }
        }
      }
      table.push(row);
    }
    return table;
  })();
  const distance = (a, b) => DISTANCE[id(a)][id(b)];
  function center(song, c) {
    const home = c.center || { root: c.root, minor: c.quality === "min" };
    return { root: (home.root + song.tonic) % 12, minor: home.minor };
  }
  const bassClass = song => (song.tonic + song.stageChord.root) % 12;
  // A colored triad's pitch classes. A minor ninth above the bass is the one
  // clash a pedal cannot carry, so a color that adds one is left out.
  function upperClasses(upper, color) {
    return color.apply(upper.minor ? 3 : 4).map(step => (upper.root + step) % 12);
  }
  const clashes = (song, pcs) => pcs.includes((bassClass(song) + 1) % 12);
  // Every change must sound like one: no color that repeats the last chord's
  // notes (staying put, or C minor sus2 after C sus2).
  function colorFor(song, upper) {
    const key = pcs => [...new Set(pcs)].sort((a, b) => a - b).join();
    const colors = COLORS.filter(color => !clashes(song, upperClasses(upper, color)) && key(upperClasses(upper, color)) !== key(song.pcs));
    return pick(colors.length ? colors : COLORS.slice(0, 1), song.random, color => color.w);
  }
  // One step of the walk: a move that stays within the stage's radius, keeps
  // a note of the stage's chord so its function still reads, and never
  // clashes with the bass. It prefers chords that hold the bass note and not
  // undoing the last move. Staying put for a new color is also allowed.
  function roam(song) {
    const home = center(song, song.stageChord), radius = RADIUS[song.stage];
    const stagePcs = classes(song.stageChord).map(p => (p + song.tonic) % 12);
    const options = Object.entries(MOVES).map(([name, move]) => ({ name, upper: move(song.upper) }))
      .filter(option => {
        const pcs = upperClasses(option.upper, COLORS[0]);
        return distance(option.upper, home) <= radius && !clashes(song, pcs) && pcs.some(p => stagePcs.includes(p));
      });
    options.push({ name: "", upper: song.upper });
    const choice = pick(options, song.random, option =>
      (option.name ? 1 : .4)
      * (upperClasses(option.upper, COLORS[0]).includes(bassClass(song)) ? 2 : 1)
      * (option.name && option.name === song.lastMove ? .3 : 1));
    song.lastMove = choice.name;
    return choice.upper;
  }

  // A closed voicing near the previous one, so held notes stay and the rest
  // move by the smallest step.
  function voicing(pcs, previous) {
    // Chord tones in pitch order above the root, so a ninth stacks as a second.
    const order = [...new Set(pcs)].sort((a, b) => (a - pcs[0] + 12) % 12 - (b - pcs[0] + 12) % 12);
    let best = null, bestCost = Infinity;
    for (let low = 52; low < 64; low++) {
      const at = order.indexOf(low % 12);
      if (at < 0) continue;
      const notes = [low];
      for (let k = 1; k < order.length; k++) {
        let note = notes.at(-1) + 1;
        while (note % 12 !== order[(at + k) % order.length]) note++;
        notes.push(note);
      }
      const near = (list, n) => Math.min(...list.map(p => Math.abs(p - n)));
      // Neighbouring voices a semitone apart turn the pad muddy.
      const clusters = notes.slice(1).filter((n, k) => n - notes[k] === 1).length;
      const cost = 12 * clusters + (previous
        ? notes.reduce((sum, n) => sum + near(previous, n), 0) + previous.reduce((sum, p) => sum + near(notes, p), 0)
        : Math.abs(notes.reduce((sum, n) => sum + n, 0) / notes.length - 62));
      if (cost < bestCost) { best = notes; bestCost = cost; }
    }
    return best;
  }

  function createSong(random = Math.random) {
    const meter = pick(METERS, random);
    const bpm = 60 + Math.floor(random() * 21);
    const song = {
      meter, bpm,
      eighth: 30 / bpm,
      beatLength: meter.group * 30 / bpm,
      tonic: Math.floor(random() * 12),
      padWave: pick(PAD_WAVES, random),
      tinkleWave: pick(TINKLE_WAVES, random),
      progression: progression(CHORDS[0], random),
      random,
      stage: 0, high: 0, beat: 0, nextBeat: 0, changeAt: 0,
      stageChord: CHORDS[0], upper: null, color: null, lastMove: "", pcs: [], voices: null,
      bass: null, pad: null, lastTinkle: -1,
      pending: null, resolved: false, end: Infinity,
      tinkles: [], log: [],
    };
    return song;
  }

  // Pad and bass notes are open-ended: an "off" event ends one and fills in
  // its length, so a chord can last until the music decides to move.
  function hold(song, kind, t, notes, emit) {
    const event = { kind, t, notes, cutoff: 900 * (1 + .3 * song.stage) };
    song.log.push(event);
    emit(event);
    return event;
  }
  function release(song, event, t, emit) {
    if (!event || event.length !== undefined) return;
    event.length = t - event.t;
    emit({ kind: "off", t, of: event });
  }
  // A whole number of bars lasting 4–8 seconds, or the nearest when no
  // count of this bar fits (one 9/4 bar at 60 is nine seconds).
  function span(song) {
    const bar = song.beatLength * song.meter.beats;
    const counts = [];
    for (let n = 1; n * bar <= SPAN[1] + 1e-6; n++) if (n * bar >= SPAN[0] - 1e-6) counts.push(n);
    if (!counts.length) counts.push(Math.max(1, Math.round((SPAN[0] + SPAN[1]) / 2 / bar)));
    return pick(counts, song.random) * bar;
  }
  function setUpper(song, upper, t, emit) {
    const color = colorFor(song, upper);
    song.upper = upper; song.color = color;
    song.pcs = upperClasses(upper, color);
    song.voices = voicing(song.pcs, song.voices);
    release(song, song.pad, t, emit);
    song.pad = hold(song, "pad", t, song.voices, emit);
    song.changeAt = t + span(song);
  }
  // A new stage: the bass moves to its chord and the upper voices arrive on it.
  function setStage(song, c, t, emit) {
    song.stageChord = c;
    release(song, song.bass, t, emit);
    song.bass = hold(song, "bass", t, [36 + bassClass(song)], emit);
    song.lastMove = "";
    setUpper(song, center(song, c), t, emit);
  }

  // One beat. Stage changes and roaming moves wait for a bar line; the answer
  // to a Submit lands on the very next beat.
  function beat(song, emit) {
    const t = song.nextBeat, position = song.beat % song.meter.beats;
    if (!song.bass) setStage(song, song.progression[0], t, emit);
    if (song.pending === "resolve") {
      song.pending = null; song.resolved = true;
      const bar = song.beatLength * song.meter.beats;
      song.stage = 0;
      song.voices = voicing(classes(CHORDS[0]).map(p => (p + song.tonic) % 12), song.voices);
      release(song, song.pad, t, emit); release(song, song.bass, t, emit);
      song.stageChord = CHORDS[0];
      const bass = hold(song, "bass", t, [36 + song.tonic], emit), pad = hold(song, "pad", t, song.voices, emit);
      song.pcs = classes(CHORDS[0]).map(p => (p + song.tonic) % 12);
      release(song, bass, t + 2 * bar, emit); release(song, pad, t + 2 * bar, emit);
      song.end = t + 2 * bar + 4;
      song.nextBeat = Infinity;
      return;
    }
    if (song.pending === "deceive") {
      // A wrong answer turns aside to vi instead of home, and the cleared
      // board climbs again from there.
      song.pending = null;
      song.progression = progression(chord("vi"), song.random);
      song.stage = song.high = 0;
      setStage(song, song.progression[0], t, emit);
    } else if (position === 0 && song.high > song.stage) {
      // One stage per bar, so a quick solve still hears every chord in turn.
      song.stage++;
      setStage(song, song.progression[song.stage], t, emit);
    } else if (position === 0 && t >= song.changeAt - 1e-6) {
      setUpper(song, roam(song), t, emit);
    }
    song.beat++;
    song.nextBeat += song.beatLength;
  }

  // A tinkle is one chord tone, ringing again every quarter, eighth or
  // sixteenth on the beat grid as it fades over three beats.
  function startTinkle(song, now, velocity, emit) {
    const tones = song.pcs.length ? song.pcs : classes(CHORDS[0]).map(p => (p + song.tonic) % 12);
    const choices = tones.filter(p => p !== song.lastTinkle % 12);
    const pc = choices[Math.floor(song.random() * choices.length)];
    const octaves = [72, 84].map(base => base + (pc - base % 12 + 12) % 12).filter(n => n <= 86);
    const midi = octaves[Math.floor(song.random() * octaves.length)];
    song.lastTinkle = midi;
    const step = song.eighth * [2, 1, .5][Math.floor(song.random() * 3)];
    let next = Math.ceil(now / step) * step;
    if (next - now < .05) next += step;
    if (song.tinkles.length >= TINKLE_VOICES) song.tinkles.shift();
    song.tinkles.push({ midi, velocity, start: now, next, step, end: now + TINKLE_BEATS * song.beatLength });
    emit(tinkleEvent(song, now, midi, velocity));
  }
  function tinkleEvent(song, t, midi, velocity) {
    const event = { kind: "tinkle", t, midi, velocity };
    song.log.push(event);
    return event;
  }

  function schedule(song, until, emit) {
    while (song.nextBeat < until) beat(song, emit);
    for (const tinkle of song.tinkles) {
      while (tinkle.next < until && tinkle.next < tinkle.end) {
        const fade = Math.pow(.05, (tinkle.next - tinkle.start) / (tinkle.end - tinkle.start));
        emit(tinkleEvent(song, tinkle.next, tinkle.midi, tinkle.velocity * fade));
        tinkle.next += tinkle.step;
      }
    }
    song.tinkles = song.tinkles.filter(tinkle => tinkle.next < tinkle.end);
  }

  // ---- Synthesis -------------------------------------------------------------
  const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
  // Deterministic, so a saved render hears the same room as the live one.
  function impulse(ctx, seconds = 2.8) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 0x9e3779b9;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 2 ** 31 - 1) * Math.pow(1 - i / length, 3.5);
      }
    }
    return buffer;
  }
  // master <- [music, sfx] dry plus a shared reverb. The pad plays through
  // music and the tinkles through sfx, so each follows its own slider.
  function mixer(ctx) {
    const master = ctx.createGain(), music = ctx.createGain(), sfx = ctx.createGain();
    const mix = ctx.createGain(), reverb = ctx.createConvolver(), wet = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.ratio.value = 8;
    reverb.buffer = impulse(ctx);
    wet.gain.value = .3;
    music.connect(mix); sfx.connect(mix);
    mix.connect(master); mix.connect(reverb); reverb.connect(wet); wet.connect(master);
    master.connect(limiter); limiter.connect(ctx.destination);
    return { master, music, sfx };
  }

  // Pads swell in, hold, and fade out under the next chord's swell.
  const SWELL = { pad: 1.4, bass: 2 };
  const FADE = .7;
  function startHeld(ctx, out, song, event, at) {
    const filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    filter.type = "lowpass"; filter.frequency.value = event.cutoff; filter.Q.value = .4;
    filter.connect(envelope); envelope.connect(out);
    const peak = (event.kind === "bass" ? .07 : .04) * PAD_GAIN[song.padWave];
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + SWELL[event.kind]);
    const oscillators = [];
    for (const note of event.notes) {
      // Two slightly detuned oscillators per chord tone; the bass gets one.
      for (const detune of event.kind === "bass" ? [0] : [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = song.padWave; osc.frequency.value = frequency(note); osc.detune.value = detune;
        osc.connect(filter); osc.start(at);
        oscillators.push(osc);
      }
    }
    return { gain: envelope.gain, oscillators };
  }
  function endHeld(voice, at) {
    if (voice.gain.cancelAndHoldAtTime) voice.gain.cancelAndHoldAtTime(at);
    else voice.gain.cancelScheduledValues(at);
    voice.gain.setTargetAtTime(0, at, FADE);
    for (const osc of voice.oscillators) osc.stop(at + 8 * FADE);
  }
  function playTinkle(ctx, out, song, event, at) {
    const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    osc.type = song.tinkleWave; osc.frequency.value = frequency(event.midi);
    filter.type = "lowpass"; filter.frequency.value = 4000;
    osc.connect(filter); filter.connect(envelope); envelope.connect(out);
    const peak = .14 * event.velocity * WAVE_GAIN[song.tinkleWave];
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + .004);
    envelope.gain.setTargetAtTime(0, at + .004, .1);
    osc.start(at); osc.stop(at + .7);
  }
  // A player for one context: buses { pad, tinkle }, and time of song zero.
  function player(ctx, buses, song, origin) {
    const voices = new Map();
    return event => {
      const at = Math.max(origin + event.t, ctx.currentTime);
      if (event.kind === "tinkle") playTinkle(ctx, buses.tinkle, song, event, at);
      else if (event.kind === "off") {
        const voice = voices.get(event.of);
        if (voice) { endHeld(voice, at); voices.delete(event.of); }
      } else voices.set(event, startHeld(ctx, buses.pad, song, event, at));
    };
  }

  // ---- Live playback ---------------------------------------------------------
  let ctx = null, mix = null, song = null, live = null, playing = false;
  let lastCells = null, lastHistory = 0;
  // The song of the last correct Submit on this board, kept for saving.
  let solved = null;
  const levels = () => typeof soundLevels === "object" ? soundLevels : { master: 100, music: 100, sfx: 100 };
  const audible = () => levels().master > 0 && (levels().music > 0 || levels().sfx > 0);

  // Browsers only let audio start inside a user gesture.
  function unlock() {
    if (!ctx && audible() && (window.AudioContext || window.webkitAudioContext)) {
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch {}
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      mix = mixer(ctx);
    }
    sync(playing);
  }
  for (const type of ["pointerdown", "keydown", "touchend"]) document.addEventListener(type, unlock, true);

  function songNow() { return ctx.currentTime - live.origin; }
  function tick() {
    if (!ctx || ctx.state !== "running" || !song) return;
    if (!live) {
      const pad = ctx.createGain(), tinkle = ctx.createGain();
      pad.connect(mix.music); tinkle.connect(mix.sfx);
      live = { pad, tinkle, origin: ctx.currentTime + .05 };
      live.emit = player(ctx, live, song, live.origin);
    }
    schedule(song, songNow() + LOOKAHEAD, live.emit);
  }
  setInterval(tick, 25);

  function stop() {
    if (live && ctx) {
      const { pad, tinkle } = live, now = ctx.currentTime;
      for (const bus of [pad, tinkle]) { bus.gain.setTargetAtTime(0, now, .1); }
      setTimeout(() => { pad.disconnect(); tinkle.disconnect(); }, 800);
    }
    song = live = null;
  }

  // Called from clock(): play while a board is on screen, pause otherwise.
  function sync(active) {
    playing = active;
    if (!ctx) return;
    const level = levels(), now = ctx.currentTime;
    mix.master.gain.setTargetAtTime(level.master / 100, now, .05);
    mix.music.gain.setTargetAtTime(level.music / 100, now, .05);
    mix.sfx.gain.setTargetAtTime(level.sfx / 100, now, .05);
    const run = playing && !!song && audible();
    if (run && ctx.state !== "running") ctx.resume().catch(() => {});
    if (!run && ctx.state === "running") ctx.suspend().catch(() => {});
    if (song) retarget();
  }

  // Tension follows filled cells against the solution's count in four equal
  // buckets, and is at its height whenever Submit is offered. It never falls
  // back: undo and Reset keep the high-water mark.
  function retarget() {
    if (!song || song.resolved || song.pending || !state?.cells) return;
    const total = state.solution.reduce((sum, v) => sum + v, 0) || 1;
    const filled = state.cells.reduce((sum, c) => sum + (c.state === 1), 0);
    let stage = Math.min(STAGES - 1, Math.floor(STAGES * filled / total));
    if (el("app").dataset.submitReady === "true") stage = STAGES - 1;
    song.high = Math.max(song.high, stage);
  }

  // Called with each engine state from rotate.js.
  function onState(next, fresh) {
    if (fresh || next.editing) {
      stop();
      if (fresh) solved = null;
      if (!next.editing && !next.won) song = createSong();
      lastCells = null;
    }
    if (!song) return;
    retarget();
    // One tinkle per mark. Undo, Reset, auto-cross and a wrong answer change
    // many cells or rewind history, so they stay quiet.
    const cells = next.cells.map(c => c.state);
    if (lastCells && next.history >= lastHistory && !next.won && ctx?.state === "running" && live) {
      const changed = cells.reduce((list, s, k) => s !== lastCells[k] ? [...list, k] : list, []);
      if (changed.length >= 1 && changed.length <= 2)
        startTinkle(song, songNow(), [.5, 1, .7][cells[changed[0]]], live.emit);
    }
    lastCells = cells; lastHistory = next.history;
  }

  function submitted(correct) {
    if (!song || song.resolved) return;
    song.pending = correct ? "resolve" : "deceive";
    if (correct) solved = song;
  }

  // ---- MIDI export -----------------------------------------------------------
  function midiFile(record) {
    const ppq = 480, perSecond = ppq * record.bpm / 60;
    const tick = t => Math.max(0, Math.round(t * perSecond));
    const varLength = n => {
      const bytes = [n & 0x7f];
      while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
      return bytes;
    };
    const track = events => {
      events.sort((a, b) => a.at - b.at || a.order - b.order);
      const bytes = [];
      let last = 0;
      for (const event of events) { bytes.push(...varLength(event.at - last), ...event.data); last = event.at; }
      bytes.push(0, 0xff, 0x2f, 0);
      return [0x4d, 0x54, 0x72, 0x6b, ...[24, 16, 8, 0].map(s => bytes.length >>> s & 255), ...bytes];
    };
    const [numerator, denominator] = record.meter.signature;
    const micros = Math.round(60e6 / record.bpm);
    const conductor = [
      { at: 0, order: 0, data: [0xff, 0x51, 3, micros >> 16 & 255, micros >> 8 & 255, micros & 255] },
      { at: 0, order: 0, data: [0xff, 0x58, 4, numerator, Math.log2(denominator), 24, 8] },
    ];
    const notes = (channel, program, list) => {
      const out = [{ at: 0, order: 0, data: [0xc0 | channel, program] }];
      for (const { t, length, midi, velocity } of list) {
        const v = Math.max(1, Math.min(127, Math.round(velocity * 100)));
        out.push({ at: tick(t), order: 2, data: [0x90 | channel, midi, v] });
        out.push({ at: Math.max(tick(t) + 1, tick(t + length)), order: 1, data: [0x80 | channel, midi, 0] });
      }
      return out;
    };
    // A chord still sounding when the log ends lasts until the last event.
    const last = Math.max(0, ...record.log.map(e => e.t + (e.length || 0)));
    const held = kind => record.log.filter(e => e.kind === kind)
      .flatMap(e => e.notes.map(midi => ({ t: e.t, length: e.length ?? last - e.t, midi, velocity: .7 })));
    const tinkles = record.log.filter(e => e.kind === "tinkle")
      .map(e => ({ t: e.t, length: Math.min(.2, record.eighth / 2), midi: e.midi, velocity: e.velocity }));
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 4, ppq >> 8, ppq & 255];
    // General MIDI: Pad 2 (warm) for the chords, Pad 3 (polysynth) for the
    // pedal and Music Box for the tinkles.
    return new Uint8Array([...header, ...track(conductor), ...track(notes(0, 89, held("pad"))),
      ...track(notes(1, 90, held("bass"))), ...track(notes(2, 10, tinkles))]);
  }
  function download(name = "delta-triplex") {
    if (!solved) return false;
    const url = URL.createObjectURL(new Blob([midiFile(solved)], { type: "audio/midi" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: name + ".mid" });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  return {
    onState, submitted, sync, download,
    get canDownload() { return !!solved?.log.length; },
    get song() { return song; },
    // Pure parts, for tests and offline rendering.
    CHORDS, METERS, MOVES, progression, voicing, distance, createSong, schedule, startTinkle, midiFile, mixer, player,
  };
})();
