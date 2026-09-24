#!/usr/bin/env node
// Delta Triplex daily puzzles and anonymous solve statistics.
// No dependencies: node:http and node:sqlite (Node 22.13+). Caddy proxies /api/*
// here; the game itself stays a static file.
//
//   PORT=8787 DELTA_DB=/var/lib/delta/delta.sqlite node server/api.mjs
//   node server/api.mjs --static public   # also serve the game, for local dev
//
// Players have no accounts. The browser makes a random secret and sends it with
// each solve; the database keeps only its SHA-256. Typing the same secret on
// another device ("sync code") makes it the same player.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.DELTA_DB || join(here, "delta.sqlite");
const DAILIES = process.env.DELTA_DAILIES || join(here, "dailies.json");
const staticFlag = process.argv.indexOf("--static");
const STATIC = staticFlag > 0 ? resolve(process.argv[staticFlag + 1] || "public") : null;
// Dates are local to each player, so a date is out once it is today anywhere.
const EARLIEST_ZONE_HOURS = 14;
const SECRET = /^[0-9A-HJKMNP-TV-Z]{25}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function openDatabase(path = DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      secret_hash BLOB NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dailies (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL
    );
    -- Only a player's first solve of a daily counts.
    CREATE TABLE IF NOT EXISTS solves (
      date TEXT NOT NULL REFERENCES dailies(date),
      player_id INTEGER NOT NULL REFERENCES players(id),
      elapsed_ms INTEGER NOT NULL,
      turns INTEGER NOT NULL,
      solved_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (date, player_id)
    );
  `);
  return db;
}

// dailies.json is the schedule. A puzzle someone has solved is frozen, since
// changing or removing it would invalidate its statistics; only its name may
// change. Anything unsolved can be redrawn, moved or dropped.
export function loadDailies(db, list) {
  const existing = db.prepare("SELECT code FROM dailies WHERE date = ?");
  const solved = db.prepare("SELECT 1 FROM solves WHERE date = ? LIMIT 1");
  const upsert = db.prepare(`INSERT INTO dailies (date, name, code) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET name = excluded.name, code = excluded.code`);
  const rename = db.prepare("UPDATE dailies SET name = ? WHERE date = ?");
  const problems = [], listed = new Set();
  for (const { date, name, code } of list) {
    if (!DATE.test(date) || typeof name !== "string" || !decode(code)) { problems.push(`${date}: invalid entry`); continue; }
    listed.add(date);
    const row = existing.get(date);
    if (row && row.code !== code && solved.get(date)) {
      problems.push(`${date}: already solved, so its puzzle is kept (names may change)`);
      rename.run(name, date);
    } else upsert.run(date, name, code);
  }
  for (const { date } of db.prepare("SELECT date FROM dailies").all()) {
    if (listed.has(date)) continue;
    if (solved.get(date)) problems.push(`${date}: already solved, so it stays although dailies.json dropped it`);
    else db.prepare("DELETE FROM dailies WHERE date = ?").run(date);
  }
  return problems;
}

export function releasedThrough(now = Date.now()) {
  return new Date(now + EARLIEST_ZONE_HOURS * 3600e3).toISOString().slice(0, 10);
}

// TriShare.decode: version 3, size | orientation << 4, then MSB-first solution bits.
export function decode(code) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{4,22}$/.test(code)) return null;
  const bytes = Buffer.from(code, "base64url");
  const [version, shape] = bytes, n = shape & 15;
  if (version !== 3 || n < 2 || n > 10 || shape >> 4 > 2 || bytes.length !== 2 + Math.ceil(n * n / 8)) return null;
  let solution = "";
  for (let i = 0; i < n * n; i++) solution += (bytes[2 + (i >> 3)] >> (7 - (i & 7))) & 1;
  return { size: n, solution };
}

const hashSecret = secret => createHash("sha256").update(secret).digest();

// "Top X%": the share of solvers at least as good as you, rounded up, so the
// best of 10 is top 10% and a lone solver is top 100%.
function standing(values, mine) {
  const better = values.filter(v => v < mine).length;
  return Math.max(1, Math.ceil(100 * (better + 1) / values.length));
}
function median(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
// Time buckets are logarithmic between the fastest and slowest solves so a few
// long sessions do not flatten the chart; rotations use whole-number buckets.
function histogram(values, log, maxBins) {
  const lo = values[0], hi = values.at(-1);
  if (lo === hi) return { edges: [lo, hi], counts: [values.length] };
  if (!log) {
    const width = Math.max(1, Math.ceil((hi - lo + 1) / maxBins));
    const bins = Math.ceil((hi - lo + 1) / width);
    const counts = Array(bins).fill(0);
    for (const v of values) counts[Math.floor((v - lo) / width)]++;
    return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), counts };
  }
  const a = Math.log(Math.max(1, lo)), b = Math.log(Math.max(2, hi)), bins = Math.min(maxBins, values.length);
  const edges = Array.from({ length: bins + 1 }, (_, i) => Math.round(Math.exp(a + (b - a) * i / bins)));
  edges[0] = lo; edges[bins] = hi;
  const counts = Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor((Math.log(Math.max(1, v)) - a) / (b - a) * bins)))]++;
  return { edges, counts };
}

export function stats(db, date, playerId = null) {
  const rows = db.prepare("SELECT player_id, elapsed_ms, turns FROM solves WHERE date = ?").all(date);
  const result = { date, solvers: rows.length };
  if (!rows.length) return result;
  const times = rows.map(r => r.elapsed_ms).sort((a, b) => a - b);
  const turns = rows.map(r => r.turns).sort((a, b) => a - b);
  result.time = { median: median(times), histogram: histogram(times, true, 12) };
  result.turns = { par: median(turns), histogram: histogram(turns, false, 12) };
  const mine = rows.find(r => r.player_id === playerId);
  if (mine) {
    result.you = {
      elapsedMs: mine.elapsed_ms, turns: mine.turns,
      timeTop: standing(times, mine.elapsed_ms), turnsTop: standing(turns, mine.turns),
    };
  }
  return result;
}

function player(db, secret, create) {
  const hash = hashSecret(secret);
  const found = db.prepare("SELECT id FROM players WHERE secret_hash = ?").get(hash);
  if (found || !create) return found?.id ?? null;
  return Number(db.prepare("INSERT INTO players (secret_hash) VALUES (?)").run(hash).lastInsertRowid);
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const need = (ok, message, status = 400) => { if (!ok) throw new HttpError(status, message); };

export function handler(db, { now = () => Date.now() } = {}) {
  const released = date => DATE.test(date) && date <= releasedThrough(now());
  const daily = date => released(date) ? db.prepare("SELECT date, name, code FROM dailies WHERE date = ?").get(date) : null;
  const routes = {
    "GET /api/dailies": () => ({
      dailies: db.prepare("SELECT date, name FROM dailies WHERE date <= ? ORDER BY date").all(releasedThrough(now())),
    }),
    "GET /api/daily": (_, date) => {
      const row = daily(date);
      need(row, "No puzzle for that date", 404);
      return { ...row };
    },
    // Idempotent: a repeat or later solve returns the first one's standing.
    "POST /api/solve": body => {
      const { secret, date, elapsedMs, turns, filled } = body;
      need(SECRET.test(secret), "Invalid player code");
      const row = daily(date);
      need(row, "No puzzle for that date", 404);
      need(Number.isInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 7 * 864e5, "Invalid time");
      need(Number.isInteger(turns) && turns >= 0 && turns <= 1e5, "Invalid rotation count");
      need(filled === decode(row.code).solution, "That board is not the solution", 422);
      const id = player(db, secret, true);
      db.prepare("INSERT OR IGNORE INTO solves (date, player_id, elapsed_ms, turns) VALUES (?, ?, ?, ?)")
        .run(date, id, elapsedMs, turns);
      return stats(db, date, id);
    },
    "POST /api/stats": body => {
      need(daily(body.date), "No puzzle for that date", 404);
      const id = SECRET.test(body.secret) ? player(db, body.secret, false) : null;
      return stats(db, body.date, id);
    },
    // Everything a synced device needs to rebuild its calendar.
    "POST /api/me": body => {
      need(SECRET.test(body.secret), "Invalid player code");
      const id = player(db, body.secret, false);
      const solves = id === null ? [] : db.prepare(
        "SELECT date, elapsed_ms AS elapsedMs, turns FROM solves WHERE player_id = ? ORDER BY date").all(id);
      return { known: id !== null, solves };
    },
  };
  return async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    // The API holds no cookies, so any origin (including an offline copy of the
    // game) may call it.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    const [, , resource, param] = url.pathname.split("/");
    const route = routes[`${request.method} /api/${resource}`];
    if (!url.pathname.startsWith("/api/") || !route) {
      if (STATIC && request.method === "GET") return serveStatic(url.pathname, response);
      return send(response, 404, { error: "Not found" });
    }
    try {
      let body = {};
      if (request.method === "POST") {
        let raw = "";
        for await (const chunk of request) { raw += chunk; need(raw.length < 4096, "Request too large", 413); }
        try { body = JSON.parse(raw || "{}"); } catch { throw new HttpError(400, "Invalid JSON"); }
        need(body && typeof body === "object", "Invalid JSON");
      }
      const cache = request.method === "GET" && resource === "daily" ? "public, max-age=300" : "no-store";
      send(response, 200, route(body, decodeURIComponent(param || "")), cache);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      send(response, error.status || 500, { error: error.status ? error.message : "Server error" });
    }
  };
}

function send(response, status, body, cache = "no-store") {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache });
  response.end(JSON.stringify(body));
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain" };
function serveStatic(pathname, response) {
  const file = resolve(STATIC, "." + (pathname === "/" ? "/game.html" : decodeURIComponent(pathname)));
  if (!file.startsWith(STATIC) || !existsSync(file)) return send(response, 404, { error: "Not found" });
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  if (existsSync(DAILIES)) {
    const problems = loadDailies(db, JSON.parse(readFileSync(DAILIES, "utf8")));
    for (const problem of problems) console.warn(problem);
  } else console.warn(`No ${DAILIES}; serving only dailies already in the database.`);
  createServer(handler(db)).listen(PORT, HOST, () =>
    console.log(`Delta Triplex API on http://${HOST}:${PORT}${STATIC ? ` (serving ${STATIC})` : ""}`));
}
