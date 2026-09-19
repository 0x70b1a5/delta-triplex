"use strict";
// Version 1: version, side length, orientation, then MSB-first packed solution bits.
// Base64url has no padding. Solution order is the existing north-row-major order.
window.TriShare = {
  encode(puzzle) {
    const direction = ["S", "E", "N", "W"].indexOf(puzzle.orientation || "S");
    const n = puzzle.size;
    if (
      !Number.isInteger(n) ||
      n < 2 ||
      n > 10 ||
      direction < 0 ||
      !Array.isArray(puzzle.solution) ||
      puzzle.solution.length !== n * n ||
      !puzzle.solution.every((v) => v === 0 || v === 1)
    )
      throw Error("Invalid puzzle.");
    const bytes = new Uint8Array(3 + Math.ceil((n * n) / 8));
    bytes.set([1, n, direction]);
    puzzle.solution.forEach((v, i) => {
      bytes[3 + (i >> 3)] |= v << (7 - (i & 7));
    });
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  },
  decode(code) {
    if (!/^[A-Za-z0-9_-]{6,22}$/.test(code))
      throw Error("Invalid puzzle link.");
    const bytes = Uint8Array.from(
      atob(code.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const [version, n, direction] = bytes;
    if (
      version !== 1 ||
      n < 2 ||
      n > 10 ||
      direction > 3 ||
      bytes.length !== 3 + Math.ceil((n * n) / 8)
    )
      throw Error("Unsupported puzzle link.");
    const puzzle = {
      format: "tri-logic",
      version: 2,
      cellOrder: "north-row-major",
      name: "Shared puzzle",
      size: n,
      orientation: ["S", "E", "N", "W"][direction],
      solution: Array.from(
        { length: n * n },
        (_, i) => (bytes[3 + (i >> 3)] >> (7 - (i & 7))) & 1,
      ),
    };
    if (this.encode(puzzle) !== code) throw Error("Invalid puzzle link.");
    return puzzle;
  },
  // Replace this origin when the public release has an address.
  base: "https://delta-triplex.example/",
  seedPuzzle(seed, difficulty, orientation) {
    if (
      !/^[0-9a-f]{1,8}$/i.test(seed) ||
      !["easy", "medium", "hard", "impossible"].includes(difficulty) ||
      (orientation !== undefined && !["S", "E", "N", "W"].includes(orientation))
    )
      throw Error("Invalid seed link.");
    const number = parseInt(seed, 16),
      level = ["easy", "medium", "hard", "impossible"].indexOf(difficulty);
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
      ...(orientation ? { orientation } : {}),
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
        ["easy", "medium", "hard", "impossible"][puzzle.difficulty] +
        "&orientation=" +
        puzzle.orientation
      );
    return this.base + "#p=" + this.encode(puzzle);
  },
};
