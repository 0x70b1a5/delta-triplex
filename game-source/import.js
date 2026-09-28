"use strict";
// One-off handoff from the old origin. delta.theologi.ca/move (server/move.html)
// reads that origin's localStorage and sends it here as #import=<base64url JSON>.
// This runs before every other script, so the game starts on the merged storage
// and never sees the import hash. Progress stores are merged; for everything
// else the old value wins, since the new origin only holds a few hours of play.
(() => {
  const match = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!match) return;
  history.replaceState(null, "", location.pathname + location.search);
  let incoming;
  try {
    const binary = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
    incoming = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
  } catch { return; }
  if (!incoming || typeof incoming !== "object") return;
  const KEY = /^(tri-|delta-triplex-)/;
  const SECRET = /^[0-9A-HJKMNP-TV-Z]{25}$/;
  const parse = text => { try { return JSON.parse(text); } catch { return null; } };
  const isObject = value => value && typeof value === "object" && !Array.isArray(value);

  const oldPlayer = parse(incoming["tri-daily-v1"])?.player;
  const newPlayer = parse(localStorage.getItem("tri-daily-v1"))?.player;
  // Endless solves are submitted under the daily player code too.
  const playerChanged = SECRET.test(oldPlayer || "") && oldPlayer !== newPlayer;

  // Records keyed by daily date or Endless puzzle. A solve beats no solve; with
  // two solves the old one stays, as it is already on the server under the old code.
  function mergeRecords(mine, theirs) {
    const out = {};
    for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const a = mine[key], b = theirs[key];
      const record = !a ? { ...b } : !b ? { ...a } : a.solve && !b.solve ? { ...b, ...a } : { ...a, ...b };
      delete record.stats;
      // Solved only here: submit it again under the old code, as Stats sync does.
      if (playerChanged && record.solve && !b?.solve) record.submitted = false;
      out[key] = record;
    }
    return out;
  }

  function merge(key, mineText, theirsText) {
    const mine = parse(mineText), theirs = parse(theirsText);
    if (key === "tri-daily-v1" && isObject(mine?.days) && isObject(theirs?.days)) {
      const player = SECRET.test(theirs.player || "") ? theirs.player : mine.player;
      return JSON.stringify({ ...mine, ...theirs, player, days: mergeRecords(mine.days, theirs.days) });
    }
    if (key === "tri-endless-v2" && isObject(mine?.puzzles) && isObject(theirs?.puzzles)) {
      const current = { ...(isObject(mine.current) ? mine.current : {}) };
      for (const [difficulty, number] of Object.entries(isObject(theirs.current) ? theirs.current : {}))
        current[difficulty] = Math.max(Number(current[difficulty]) || 1, Number(number) || 1);
      return JSON.stringify({ ...mine, ...theirs, current, puzzles: mergeRecords(mine.puzzles, theirs.puzzles) });
    }
    if (key === "tri-rotate-attempts-v1" && isObject(mine) && isObject(theirs)) {
      const out = { ...mine };
      for (const [id, attempt] of Object.entries(theirs))
        if (!(out[id]?.finished && !attempt?.finished)) out[id] = attempt;
      return JSON.stringify(out);
    }
    return theirsText;
  }

  try {
    for (const [key, value] of Object.entries(incoming)) {
      if (!KEY.test(key) || typeof value !== "string") continue;
      const mine = localStorage.getItem(key);
      localStorage.setItem(key, mine === null ? value : merge(key, mine, value));
    }
  } catch {}
})();
