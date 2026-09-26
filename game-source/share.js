"use strict";
// Version 3: version, then side length (low four bits) with the author's
// orientation (0-2, the next two bits), then MSB-first packed solution bits.
// Base64url has no padding. Solution order is the existing north-row-major order.
window.TriShare = {
  // 32 seed bits + 3 difficulty bits fit in seven Base32 digits. Use arithmetic,
  // not bitwise operators, because JavaScript bitwise operations truncate to 32 bits.
  seedCode(seed, difficulty) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 4) return "";
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let value = difficulty * 0x100000000 + seed, code = "";
    do { code = alphabet[value % 32] + code; value = Math.floor(value / 32); } while (value);
    code = code.padStart(7, "0");
    return code.slice(0, 3) + "-" + code.slice(3);
  },
  parseSeedCode(code) {
    const normalized = String(code).trim().toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    if (!/^[0-9A-HJKMNP-TV-Z]{7}$/.test(normalized)) throw Error(TriCopy.t("share.invalid-seed-link"));
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const value = [...normalized].reduce((number, char) => number * 32 + alphabet.indexOf(char), 0);
    const difficulty = Math.floor(value / 0x100000000), seed = value % 0x100000000;
    if (difficulty > 4) throw Error(TriCopy.t("share.invalid-seed-link"));
    return { seed, difficulty };
  },
  encode(puzzle) {
    const n = puzzle.size;
    if (
      !Number.isInteger(n) ||
      n < 2 ||
      n > 10 ||
      !Array.isArray(puzzle.solution) ||
      puzzle.solution.length !== n * n ||
      !puzzle.solution.every((v) => v === 0 || v === 1) ||
      ![undefined, 0, 1, 2].includes(puzzle.orientation)
    )
      throw Error(TriCopy.t("share.invalid-puzzle"));
    const bytes = new Uint8Array(2 + Math.ceil((n * n) / 8));
    bytes.set([3, n | (puzzle.orientation || 0) << 4]);
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
      throw Error(TriCopy.t("share.invalid-puzzle-link"));
    const bytes = Uint8Array.from(
      atob(code.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const [version, shape] = bytes;
    const n = shape & 15, orientation = shape >> 4;
    const offset = 2;
    if (
      version !== 3 ||
      orientation > 2 ||
      n < 2 ||
      n > 10 ||
      bytes.length !== offset + Math.ceil((n * n) / 8)
    )
      throw Error(TriCopy.t("share.unsupported-puzzle-link"));
    const puzzle = {
      format: "tri-logic",
      version: 3,
      cellOrder: "north-row-major",
      name: TriCopy.t("share.defaultName"),
      size: n,
      orientation,
      solution: Array.from(
        { length: n * n },
        (_, i) => (bytes[offset + (i >> 3)] >> (7 - (i & 7))) & 1,
      ),
    };
    if (this.encode(puzzle) !== code) throw Error(TriCopy.t("share.invalid-puzzle-link"));
    return puzzle;
  },
  // Replace this origin when the public release has an address.
  base: "https://delta.theologi.ca/",
  seedPuzzle(code) {
    const { seed: number, difficulty: level } = this.parseSeedCode(code);
    const json = Module.ccall(
      "game_generate",
      "string",
      ["number", "number"],
      [level, number],
    );
    if (!json) throw Error(TriCopy.t("share.this-seed-is-not-supported-by-this-generator"));
    return {
      ...JSON.parse(json),
      name: TriCopy.t("share.seedName", { difficulty: TriCopy.t("difficulty." + level + ".sentence") }),
      seed: number,
      difficulty: level,
    };
  },
  // Numbered Endless puzzles are the same for everyone: "hard-12" is Hard #12.
  // Slugs are protocol values in difficulty-ID order, never translated.
  endlessSlugs: ["easy", "medium", "hard", "impossible", "sprout"],
  endlessKey(difficulty, number) {
    if (!this.endlessSlugs[difficulty] || !Number.isInteger(number) || number < 1) return "";
    return this.endlessSlugs[difficulty] + "-" + number;
  },
  // Accepts "hard-12", "Hard 12", "hard #12" or "hard12".
  parseEndless(text) {
    const match = /^([a-z]+)[-\s#]*(\d{1,10})$/i.exec(String(text).trim());
    const difficulty = match ? this.endlessSlugs.indexOf(match[1].toLowerCase()) : -1;
    const number = match ? Number(match[2]) : 0;
    if (difficulty < 0 || !Number.isSafeInteger(number) || number < 1 || number > 0x7fffffff) throw Error(TriCopy.t("share.invalid-endless-link"));
    return { difficulty, number };
  },
  // null when a finite difficulty (Sprout, Easy) has no puzzle that far.
  endlessPuzzle(difficulty, number) {
    const json = Module.ccall("game_endless", "string", ["number", "number"], [difficulty, number]);
    if (!json) return null;
    return {
      ...JSON.parse(json),
      name: TriCopy.t("endless.name", { difficulty: TriCopy.t(["ui.easy", "ui.medium", "ui.hard", "ui.impossible", "ui.sprout"][difficulty]), number }),
      difficulty,
      number,
      endless: this.endlessKey(difficulty, number),
    };
  },
  endlessFromText(text) {
    const { difficulty, number } = this.parseEndless(text);
    const puzzle = this.endlessPuzzle(difficulty, number);
    if (!puzzle) throw Error(TriCopy.t("share.invalid-endless-link"));
    return puzzle;
  },
  fromText(text) {
    const input = text.trim();
    if (!input) throw Error(TriCopy.t("share.invalid-seed-link"));
    if (!input.includes("://") && !input.startsWith("#")) {
      // A difficulty name wins: "easy123" is also valid Base32, but means Easy #123.
      let numbered = null;
      try { numbered = this.parseEndless(input); } catch {}
      return numbered ? this.endlessFromText(input) : this.seedPuzzle(input);
    }
    const url = new URL(input, this.base);
    if (!["https:", "http:"].includes(url.protocol)) throw Error(TriCopy.t("share.invalid-puzzle-link"));
    const params = new URLSearchParams(url.hash.slice(1));
    if (params.has("endless")) return this.endlessFromText(params.get("endless"));
    if (params.has("seed")) return this.seedPuzzle(params.get("seed"));
    if (params.has("p")) return this.decode(params.get("p"));
    throw Error(TriCopy.t("share.invalid-puzzle-link"));
  },
  url(puzzle) {
    if (puzzle.endless) return this.base + "#endless=" + puzzle.endless;
    const code = this.seedCode(puzzle.seed, puzzle.difficulty);
    if (code) return this.base + "#seed=" + code;
    return this.base + "#p=" + this.encode(puzzle);
  },
};
