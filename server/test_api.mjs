// node --test server/test_api.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { openDatabase, loadDailies, handler, decode, releasedThrough } from "./api.mjs";

// A 3-row board: the tip and the whole base row filled.
const CODE = encode(3, "100011111".split("").map(Number));
function encode(n, bits) {
  const bytes = Buffer.alloc(2 + Math.ceil(n * n / 8));
  bytes[0] = 3; bytes[1] = n;
  bits.forEach((v, i) => { bytes[2 + (i >> 3)] |= v << (7 - (i & 7)); });
  return bytes.toString("base64url");
}
const SOLUTION = decode(CODE).solution;
const secret = c => c.repeat(25);

async function withServer(nowIso, fn) {
  const db = openDatabase(":memory:");
  let now = Date.parse(nowIso);
  loadDailies(db, [
    { date: "2026-09-23", name: "Yesterday", code: CODE },
    { date: "2026-09-24", name: "Today", code: CODE },
    { date: "2026-09-26", name: "Future", code: CODE },
  ], now);
  const server = createServer(handler(db, { now: () => now }));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (path, body) => {
    const response = await fetch(base + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try { await fn(api, db, t => { now = Date.parse(t); }); } finally { server.close(); db.close(); }
}

test("codes decode like TriShare", () => {
  assert.equal(decode(CODE).size, 3);
  assert.equal(SOLUTION, "100011111");
  assert.equal(decode("nope"), null);
});

test("a date is released once it is today anywhere on Earth", () => {
  assert.equal(releasedThrough(Date.parse("2026-09-24T09:59:00Z")), "2026-09-24");
  assert.equal(releasedThrough(Date.parse("2026-09-24T10:00:00Z")), "2026-09-25");
});

test("future dailies stay hidden", () => withServer("2026-09-24T12:00:00Z", async api => {
  assert.deepEqual((await api("/api/dailies")).body.dailies.map(d => d.date), ["2026-09-23", "2026-09-24"]);
  assert.equal((await api("/api/daily/2026-09-24")).body.name, "Today");
  assert.equal((await api("/api/daily/2026-09-26")).status, 404);
  assert.equal((await api("/api/daily/nonsense")).status, 404);
}));

test("solves are checked, counted once, and ranked", () => withServer("2026-09-24T12:00:00Z", async api => {
  const solve = (who, elapsedMs, turns, filled = SOLUTION, date = "2026-09-24") =>
    api("/api/solve", { secret: secret(who), date, elapsedMs, turns, filled });
  assert.equal((await solve("A", 1000, 1, "111111111")).status, 422, "a wrong board is refused");
  assert.equal((await solve("a", 1000, 1)).status, 400, "lowercase is not a canonical code");
  assert.equal((await solve("A", -5, 1)).status, 400);
  assert.equal((await solve("A", 1000, 1, SOLUTION, "2026-09-26")).status, 404, "future dates cannot be solved");

  let r = await solve("A", 60000, 4);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.you, { elapsedMs: 60000, turns: 4, timeTop: 100, turnsTop: 100 });
  r = await solve("A", 1000, 0);
  assert.equal(r.body.solvers, 1, "a repeat solve is ignored");
  assert.equal(r.body.you.elapsedMs, 60000, "the first solve stands");

  for (const [who, t, n] of [["B", 30000, 2], ["C", 90000, 6], ["D", 120000, 4]]) await solve(who, t, n);
  r = await solve("B", 30000, 2);
  assert.equal(r.body.solvers, 4);
  assert.equal(r.body.you.timeTop, 25, "fastest of four");
  assert.equal(r.body.you.turnsTop, 25);
  assert.equal(r.body.turns.par, 4, "par is the median rotation count");
  assert.equal(r.body.time.median, 75000);
  assert.equal(r.body.time.histogram.counts.reduce((a, b) => a + b), 4);
  assert.equal(r.body.turns.histogram.counts.reduce((a, b) => a + b), 4);

  const anonymous = await api("/api/stats", { date: "2026-09-24" });
  assert.equal(anonymous.body.solvers, 4);
  assert.equal(anonymous.body.you, undefined);
  const mine = await api("/api/stats", { date: "2026-09-24", secret: secret("C") });
  assert.equal(mine.body.you.timeTop, 75);
}));

test("a sync code recovers that player's solves", () => withServer("2026-09-24T12:00:00Z", async api => {
  assert.deepEqual((await api("/api/me", { secret: secret("E") })).body, { known: false, solves: [] });
  await api("/api/solve", { secret: secret("E"), date: "2026-09-23", elapsedMs: 5000, turns: 3, filled: SOLUTION });
  const me = await api("/api/me", { secret: secret("E") });
  assert.deepEqual(me.body, { known: true, solves: [{ date: "2026-09-23", elapsedMs: 5000, turns: 3 }] });
  assert.equal((await api("/api/me", { secret: "short" })).status, 400);
}));

test("solved puzzles are frozen; unsolved ones can move or go", () => {
  const db = openDatabase(":memory:");
  const other = encode(3, "011100000".split("").map(Number));
  loadDailies(db, [{ date: "2026-09-24", name: "A", code: CODE }, { date: "2026-09-23", name: "B", code: CODE },
    { date: "2026-09-22", name: "C", code: CODE }]);
  db.prepare("INSERT INTO players (id, secret_hash) VALUES (1, x'00')").run();
  db.prepare("INSERT INTO solves (date, player_id, elapsed_ms, turns) VALUES ('2026-09-24', 1, 1000, 1)").run();
  // Redraw everything and drop the 23rd and 22nd; the 22nd moves to October.
  const problems = loadDailies(db, [{ date: "2026-09-24", name: "A2", code: other }, { date: "2026-10-22", name: "C", code: CODE }]);
  assert.equal(problems.length, 1, "only the solved puzzle resists");
  assert.deepEqual({ ...db.prepare("SELECT name, code FROM dailies WHERE date='2026-09-24'").get() }, { name: "A2", code: CODE });
  assert.deepEqual(db.prepare("SELECT date FROM dailies ORDER BY date").all().map(r => r.date), ["2026-09-24", "2026-10-22"]);
  assert.equal(loadDailies(db, []).length, 1, "a solved puzzle survives being dropped");
  assert.deepEqual(db.prepare("SELECT date FROM dailies").all().map(r => r.date), ["2026-09-24"]);
});
