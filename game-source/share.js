"use strict";
// Version 2: version, side length, then MSB-first packed solution bits.
// View rotation is session state, never puzzle data. Legacy v1 links still load.
// Base64url has no padding. Solution order is the existing north-row-major order.
window.TriShare = {
  encode(puzzle) {
    const n = puzzle.size;
    if (
      !Number.isInteger(n) ||
      n < 2 ||
      n > 10 ||
      !Array.isArray(puzzle.solution) ||
      puzzle.solution.length !== n * n ||
      !puzzle.solution.every((v) => v === 0 || v === 1)
    )
      throw Error("Invalid puzzle.");
    const bytes = new Uint8Array(2 + Math.ceil((n * n) / 8));
    bytes.set([2, n]);
    puzzle.solution.forEach((v, i) => {
      bytes[2 + (i >> 3)] |= v << (7 - (i & 7));
    });
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  },
  decode(code) {
    if (!/^[A-Za-z0-9_-]{4,22}$/.test(code))
      throw Error("Invalid puzzle link.");
    const bytes = Uint8Array.from(
      atob(code.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const [version, n] = bytes;
    const offset = version === 1 ? 3 : 2;
    if (
      ![1, 2].includes(version) ||
      n < 2 ||
      n > 10 ||
      (version === 1 && bytes[2] > 3) ||
      bytes.length !== offset + Math.ceil((n * n) / 8)
    )
      throw Error("Unsupported puzzle link.");
    const puzzle = {
      format: "tri-logic",
      version: 2,
      cellOrder: "north-row-major",
      name: "Shared puzzle",
      size: n,
      solution: Array.from(
        { length: n * n },
        (_, i) => (bytes[offset + (i >> 3)] >> (7 - (i & 7))) & 1,
      ),
    };
    if (version === 2 && this.encode(puzzle) !== code) throw Error("Invalid puzzle link.");
    return puzzle;
  },
  // Replace this origin when the public release has an address.
  base: "https://delta.theologi.ca/",
  seedPuzzle(seed, difficulty) {
    if (
      !/^[0-9a-f]{1,8}$/i.test(seed) ||
      !["easy", "medium", "hard", "impossible", "sprout"].includes(difficulty)
    )
      throw Error("Invalid seed link.");
    const number = parseInt(seed, 16),
      level = ["easy", "medium", "hard", "impossible", "sprout"].indexOf(difficulty);
    const json = Module.ccall(
      "game_generate",
      "string",
      ["number", "number"],
      [level, number],
    );
    if (!json) throw Error("This seed is not supported by this generator.");
    return {
      ...JSON.parse(json),
      name: "Shared " + difficulty + " puzzle",
      seed: number,
      difficulty: level,
    };
  },
  url(puzzle) {
    if (Number.isInteger(puzzle.seed) && Number.isInteger(puzzle.difficulty))
      return (
        this.base +
        "#seed=" +
        (puzzle.seed >>> 0).toString(16) +
        "&difficulty=" +
        ["easy", "medium", "hard", "impossible", "sprout"][puzzle.difficulty]
      );
    return this.base + "#p=" + this.encode(puzzle);
  },
};
