"use strict";
// Daily puzzles, first-solve statistics (daily and Endless) and the device sync code.
// server/api.mjs releases each date's puzzle and ranks first solves. This
// browser keeps its own progress and results (tri-daily-v1; Endless in flow.js's
// tri-endless-v2), so the calendar, replays and the Today's Puzzle spark work
// without a connection.
(() => {
  const STORE = "tri-daily-v1";
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const SECRET = /^[0-9A-HJKMNP-TV-Z]{25}$/;
  const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  // Same origin on the public site and local servers. Everywhere else (portal
  // iframes such as itch.io or Newgrounds, offline copies) asks the public site.
  const sameOrigin = location.origin === new URL(TriShare.base).origin
    || /^http:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const API = (sameOrigin ? location.origin + "/" : TriShare.base) + "api/";
  // Newgrounds asks games that call outside servers to say so at the start and
  // offer an opt-out, so there (any "ground" host) nothing is sent until the
  // player has seen the notice. Everywhere else online features are always on.
  const ONLINE = "delta-triplex-online";
  const askOnline = /ground/.test(location.hostname);
  const onlineChoice = () => { try { return localStorage.getItem(ONLINE); } catch { return null; } };
  const onlineAllowed = () => !askOnline || onlineChoice() === "on";

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE));
      if (data && typeof data === "object" && data.days && typeof data.days === "object") return data;
    } catch {}
    return { days: {} };
  }
  function write(data) {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {}
  }
  const day = date => read().days[date] || null;
  function updateDay(date, patch) {
    const data = read();
    data.days[date] = { ...(data.days[date] || {}), ...patch };
    write(data);
    return data.days[date];
  }
  // 25 Crockford Base32 digits = 125 random bits. Shown in groups of five.
  function playerCode(create = false) {
    const data = read();
    if (!SECRET.test(data.player || "") && create) {
      data.player = Array.from(crypto.getRandomValues(new Uint8Array(25)), byte => ALPHABET[byte & 31]).join("");
      write(data);
    }
    return SECRET.test(data.player || "") ? data.player : "";
  }
  const groupCode = code => code.match(/.{1,5}/g).join("-");
  const normalizeCode = text => String(text).toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

  const pad = value => String(value).padStart(2, "0");
  const today = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
  const toDate = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const dateLabel = (key, options = { dateStyle: "long" }) => new Intl.DateTimeFormat(TriCopy.locale, options).format(toDate(key));
  const formatTime = ms => window.TriRotation?.formatTime(ms) ?? String(Math.round(ms / 1000));

  // Errors carry a `reason`: "offline" (no connection), "timeout" (no complete
  // reply in time), "http" (an error status) or "badReply" (an unreadable reply).
  const TIMEOUT = 15e3;
  const requestError = (reason, status = 0, detail = "") => Object.assign(Error(detail || reason), { reason, status, detail });
  async function request(path, body) {
    if (!onlineAllowed()) throw requestError("disabled");
    if (typeof fetch !== "function") throw requestError("offline");
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(requestError("timeout")), TIMEOUT); });
    const exchange = (async () => {
      let response;
      try {
        response = await fetch(API + path, body === undefined ? {} : {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } catch { throw requestError("offline"); }
      const data = await response.json().catch(() => null);
      if (!response.ok) throw requestError("http", response.status, typeof data?.error === "string" ? data.error : "");
      // A reply cut short on a weak connection can still arrive with a 200.
      if (!data || typeof data !== "object") throw requestError("badReply", response.status);
      return data;
    })();
    try { return await Promise.race([exchange, timeout]); } finally { clearTimeout(timer); }
  }

  // Dates the server has released, with their names. null until first fetched.
  let released = null, listFetched = -Infinity;
  async function refreshList(force = false) {
    if (!force && performance.now() - listFetched < 5 * 60e3) return;
    listFetched = performance.now();
    try {
      const { dailies } = await request("dailies");
      released = new Map(dailies.map(item => [item.date, item.name]));
    } catch { listFetched = -Infinity; return; }
    window.triCalendarRefresh?.();
    syncSpark();
  }
  window.triDailyListLoaded = () => !!released;
  window.triOnlineOff = () => !onlineAllowed();
  window.triDailyStatus = key => {
    const record = day(key), name = released?.get(key) ?? record?.name;
    if (!name) return null;
    return { name, solved: !!record?.solve, started: !!record && Number(record.elapsed) > 0 };
  };

  // ---- Opening a daily -------------------------------------------------------
  let opening = 0;
  window.triOpenDaily = async (date, { fromLink = false } = {}) => {
    if (!appReady) return toast(TriCopy.t("errors.loading"));
    const job = ++opening;
    const isToday = date === today();
    const record = DATE.test(date) ? day(date) : null;
    let entry = record?.code ? { code: record.code, name: record.name } : null;
    if (!entry && DATE.test(date)) {
      // Loading is brief; only the calendar's status line mentions it.
      if (!el("home").hidden && !el("home-calendar").hidden) el("calendar-status").textContent = TriCopy.t("calendar.loading");
      try { entry = await request("daily/" + date); } catch (error) {
        if (job !== opening) return;
        const message = error.reason === "disabled" ? TriCopy.t("online.off")
          : error.reason !== "http" ? TriCopy.t("calendar.offline")
          : isToday ? TriCopy.t("calendar.todayMissing")
          : TriCopy.t("calendar.selection", { date: dateLabel(date) });
        // A link or Today's Puzzle lands on the calendar so the player has somewhere to go.
        if (fromLink || isToday || el("home").hidden) window.triOpenCalendar(isToday);
        el("calendar-status").textContent = message;
        return;
      }
    }
    if (job !== opening) return;
    let puzzle;
    try { puzzle = TriShare.decode(entry?.code); } catch {
      window.triOpenCalendar(false);
      el("calendar-status").textContent = TriCopy.t("errors.puzzleLink");
      return;
    }
    puzzle.name = entry.name;
    updateDay(date, { code: entry.code, name: entry.name });
    statsOpen = false;
    loadCustom(puzzle, false, false, null, fromLink, date);
    refresh("daily/" + date);
  };
  window.triPlayToday = () => window.triOpenDaily(today());

  // ---- Progress, solves and submission ---------------------------------------
  window.triReadDailyProgress = date => day(date);
  window.triSaveDailyProgress = (date, progress) => {
    if (!day(date)) return;
    const marks = typeof progress.marks === "string" && /^[012]*$/.test(progress.marks) ? progress.marks : undefined;
    updateDay(date, {
      elapsed: progress.elapsed, turns: progress.turns, view: progress.view, finished: progress.finished ?? null,
      ...(marks === undefined ? {} : { marks }),
    });
  };
  // The engine's cells, as the canonical 0/1 string the server checks.
  function filledBits(board) {
    const bits = Array(board.n * board.n).fill("0");
    for (const cell of board.cells) {
      const r = cell.i + cell.j + cell.o;
      if (cell.state === 1) bits[r * r + 2 * cell.i + cell.o] = "1";
    }
    return bits.join("");
  }
  // Only the first solve counts; later solves after a reset replay for fun.
  window.triDailyFinished = (date, finished) => {
    const record = day(date);
    if (!record) return;
    if (!record.solve) {
      updateDay(date, { solve: { elapsed: Math.round(finished.elapsed), turns: finished.turns, filled: filledBits(state) } });
      // Let the picture's reveal play before the results cover part of it.
      setTimeout(() => {
        if (subject()?.id === "daily/" + date && state?.won) { statsOpen = true; renderStats(); }
      }, STATS_DELAY);
      syncSpark();
    }
    submit("daily/" + date);
    renderStats();
  };

  // ---- Submitting solves and fetching stats ---------------------------------
  // Ids are "daily/<date>" or "endless/<key>"; each kind says where its records
  // live and how to ask the server about them.
  const endlessRecord = key => window.TriEndless.record(key);
  const kinds = {
    daily: {
      record: day, update: updateDay,
      submit: (date, { solve }, secret) => request("solve", { secret, date, elapsedMs: solve.elapsed, turns: solve.turns, filled: solve.filled }),
      stats: date => request("stats", { date, secret: playerCode() || undefined }),
    },
    endless: {
      record: endlessRecord, update: (key, patch) => window.TriEndless.update(key, patch),
      submit: (key, { difficulty, number, solve }, secret) => request("endless/solve", {
        secret, difficulty, number, elapsedMs: solve.elapsed, turns: solve.turns, filled: solve.filled }),
      stats: (key, { difficulty, number }) => request("endless/stats", { difficulty, number, secret: playerCode() || undefined }),
    },
  };
  const split = id => { const at = id.indexOf("/"); return [kinds[id.slice(0, at)], id.slice(at + 1)]; };
  // The server's own refusals (a wrong board, an unknown puzzle) will never
  // succeed. Anything else (no connection, a timeout, a proxy error, a reply cut
  // short) may, so it is retried after growing gaps, and again when the device
  // comes back online.
  const refusal = error => [400, 404, 413, 422].includes(error.status);
  const RETRY_DELAYS = [2e3, 5e3, 10e3, 20e3, 40e3];
  const inflight = new Set();
  const trouble = new Map(); // id -> { error, attempt, timer }
  function retryLater(id, error) {
    // Switched off by the player: waiting on it until they turn it back on.
    if (error.reason === "disabled") return settle(id, error);
    const entry = trouble.get(id) || { attempt: 0, timer: 0 };
    clearTimeout(entry.timer);
    entry.error = error;
    entry.timer = entry.attempt < RETRY_DELAYS.length
      ? setTimeout(() => { entry.timer = 0; entry.attempt++; load(id); }, RETRY_DELAYS[entry.attempt]) : 0;
    trouble.set(id, entry);
  }
  function settle(id, error) {
    clearTimeout(trouble.get(id)?.timer);
    if (error) trouble.set(id, { error, attempt: RETRY_DELAYS.length, timer: 0 });
    else trouble.delete(id);
  }
  function load(id) {
    const [kind, key] = split(id);
    return kind.record(key)?.submitted ? refresh(id) : submit(id);
  }
  async function submit(id) {
    const [kind, key] = split(id), record = kind.record(key);
    if (!record?.solve || record.submitted || inflight.has(id)) return;
    const secret = playerCode(true);
    if (!record.solve.filled) {
      // Solves learned from a sync code are already on the server.
      kind.update(key, { submitted: true });
      return refresh(id);
    }
    inflight.add(id);
    renderStats();
    try {
      const stats = await kind.submit(key, record, secret);
      if (!stats.you) throw requestError("badReply", 200);
      kind.update(key, { submitted: true, stats, refused: undefined });
      settle(id);
    } catch (error) {
      if (refusal(error)) {
        kind.update(key, { submitted: true, stats: null, refused: error.detail || "HTTP " + error.status });
        settle(id);
      } else retryLater(id, error);
    } finally {
      inflight.delete(id);
      renderStats();
    }
  }
  // Brings a submitted solve's standing up to date. When the server turns out
  // not to have the solve (an earlier submission was lost), it is sent again.
  async function refresh(id) {
    const [kind, key] = split(id), record = kind.record(key);
    if (!record?.solve || !record.submitted || inflight.has(id)) return;
    inflight.add(id);
    renderStats();
    let resend = false;
    try {
      const stats = await kind.stats(key, record);
      if (stats.you) { kind.update(key, { stats, refused: undefined }); settle(id); }
      else if (record.solve.filled) resend = true;
      else { kind.update(key, { stats }); settle(id, requestError("missing")); }
    } catch (error) {
      // Standings already shown stay up; only a missing result is worth retrying.
      if (kind.record(key)?.stats?.you) settle(id);
      else if (refusal(error)) settle(id, error);
      else retryLater(id, error);
    } finally {
      inflight.delete(id);
      renderStats();
    }
    if (resend) { kind.update(key, { submitted: false }); submit(id); }
  }
  function retryPending() {
    for (const [date, record] of Object.entries(read().days)) if (record.solve && !record.submitted) submit("daily/" + date);
    for (const [key, record] of Object.entries(window.TriEndless.read().puzzles))
      if (record.solve && !record.submitted) submit("endless/" + key);
  }
  function reconnect() {
    for (const [id, entry] of trouble) { clearTimeout(entry.timer); trouble.set(id, { ...entry, attempt: 0, timer: 0 }); load(id); }
    retryPending();
  }
  window.addEventListener("online", reconnect);

  // ---- Endless solves --------------------------------------------------------
  // Only the first solve of each number counts, as with dailies. The stats open
  // from the completion row rather than by themselves, so Next stays one tap away.
  window.triEndlessFinished = (key, finished) => {
    const record = endlessRecord(key);
    if (!record) return;
    if (!record.solve)
      window.TriEndless.update(key, { solve: { elapsed: Math.round(finished.elapsed), turns: finished.turns, filled: filledBits(state) } });
    submit("endless/" + key);
    renderStats();
  };

  // ---- Stats popover ---------------------------------------------------------
  const panel = document.createElement("section");
  panel.id = "daily-stats";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "daily-stats-title");
  document.body.append(panel);
  const toggle = document.createElement("button");
  toggle.id = "daily-stats-toggle";
  toggle.className = "icon";
  toggle.hidden = true;
  toggle.title = TriCopy.t("daily.stats");
  toggle.setAttribute("aria-label", TriCopy.t("daily.stats"));
  toggle.setAttribute("aria-controls", "daily-stats");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12m7 8V5m7 15v-6M3 20h18" /></svg>';
  el("completion").insertBefore(toggle, el("next-puzzle"));
  let statsOpen = false, renderedKey = "";
  const STATS_DELAY = 2200;
  toggle.onclick = () => { statsOpen = panel.hidden; renderStats(); if (statsOpen) el("daily-stats-close")?.focus(); };
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) { statsOpen = false; renderStats(); toggle.focus(); }
  });

  const NS = "http://www.w3.org/2000/svg";
  function svgNode(name, attrs) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }
  function binOf(edges, value) {
    for (let i = 0; i < edges.length - 1; i++) if (value < edges[i + 1]) return i;
    return edges.length - 2;
  }
  // One series: every bin in the filled-cell colour at a light tint, the
  // player's bin at full strength with a "You" label above it. Both axes are
  // titled; the x axis marks its outer edges and the y axis its peak count.
  // An optional `marker` ({ value, label, log }) draws a labelled dashed line.
  function histogram({ edges, counts }, mine, { range, tick, xTitle, label, marker }) {
    const left = 34, width = 240, top = 18, base = 58, height = 90;
    const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, class: "daily-chart", role: "img", "aria-label": label });
    const slot = (width - left) / counts.length, bar = Math.min(24, slot - 2), max = Math.max(...counts);
    const you = binOf(edges, mine);
    const text = (content, attrs) => { const node = svgNode("text", attrs); node.textContent = content; return node; };
    svg.append(
      svgNode("line", { x1: left, x2: width, y1: base + .5, y2: base + .5, class: "daily-chart-axis" }),
      svgNode("line", { x1: left - .5, x2: left - .5, y1: top, y2: base + .5, class: "daily-chart-axis" }),
      text(String(max), { x: left - 4, y: top + 4, "text-anchor": "end", class: "daily-chart-tick" }),
      text("0", { x: left - 4, y: base + 3, "text-anchor": "end", class: "daily-chart-tick" }),
      text(TriCopy.t("daily.axisSolvers"), { x: 0, y: 0, "text-anchor": "middle", class: "daily-chart-title",
        transform: `translate(9 ${(top + base) / 2}) rotate(-90)` }),
      text(xTitle, { x: left + (width - left) / 2, y: height - 3, "text-anchor": "middle", class: "daily-chart-title" }));
    // A single-value histogram (everyone tied) has matching edges: one centred tick.
    const first = edges[0], last = edges[edges.length - 1];
    if (first === last) svg.append(text(tick(first, false), { x: left + (width - left) / 2, y: base + 13, "text-anchor": "middle", class: "daily-chart-tick" }));
    else svg.append(
      text(tick(first, false), { x: left, y: base + 13, "text-anchor": "start", class: "daily-chart-tick" }),
      text(tick(last, true), { x: width, y: base + 13, "text-anchor": "end", class: "daily-chart-tick" }));
    counts.forEach((count, i) => {
      const x = left + i * slot + (slot - bar) / 2;
      const h = count ? Math.max(3, (base - top) * count / max) : 0;
      const group = svgNode("g", { class: i === you ? "daily-bar daily-bar-you" : "daily-bar" });
      const title = svgNode("title", {});
      title.textContent = TriCopy.t("daily.bar", { range: range(edges[i], edges[i + 1]), count });
      // Hit target spans the whole slot so thin or empty bins still show a tooltip.
      group.append(title, svgNode("rect", { x: left + i * slot, y: 0, width: slot, height: base, fill: "transparent" }));
      if (h) {
        const r = Math.min(4, bar / 2, h);
        group.append(svgNode("path", {
          d: `M${x} ${base}V${base - h + r}Q${x} ${base - h} ${x + r} ${base - h}H${x + bar - r}Q${x + bar} ${base - h} ${x + bar} ${base - h + r}V${base}Z`,
        }));
      }
      if (i === you) group.append(text(TriCopy.t("daily.you"), { x: x + bar / 2, y: base - h - 4, "text-anchor": "middle" }));
      svg.append(group);
    });
    if (marker) {
      // Placed within its bin on the bin's own scale (log for time); a
      // single-value histogram puts it in the middle with everyone.
      const i = binOf(edges, marker.value), lo = edges[i], hi = edges[i + 1];
      const scale = marker.log ? Math.log : v => v;
      const within = hi > lo ? Math.min(1, Math.max(0, (scale(Math.max(1, marker.value)) - scale(Math.max(1, lo))) / (scale(hi) - scale(Math.max(1, lo))))) : .5;
      const x = left + (i + within) * slot, y = 4;
      // The label sits beside the line, on whichever side keeps clear of the
      // "You" label and the chart's right edge.
      const labelWidth = marker.label.length * 5.2, youX = you >= 0 ? left + (you + .5) * slot : null;
      let side = x + 3 + labelWidth <= width ? 1 : -1;
      if (youX !== null && Math.abs(youX - x) < labelWidth / 2 + 14) side = youX > x ? -1 : 1;
      svg.append(
        svgNode("line", { x1: x, x2: x, y1: y - 6, y2: base, class: "daily-chart-marker" }),
        text(marker.label, { x: x + side * 3, y, "text-anchor": side > 0 ? "start" : "end", class: "daily-chart-marker-label" }));
    }
    return svg;
  }
  const activeDaily = () => state?.custom && !state.editing && window.triActiveDaily ? window.triActiveDaily : "";
  // The puzzle whose results the Stats panel shows: a daily or a numbered Endless puzzle.
  function subject() {
    if (!state?.custom || state.editing) return null;
    const date = activeDaily();
    if (date) {
      const record = day(date);
      return record && { id: "daily/" + date, record, titleKey: "daily.statsTitle",
        name: TriCopy.t("daily.title", { date: dateLabel(date), name: record.name }) };
    }
    const key = window.triEndlessRun && window.triActiveEndless;
    const record = key ? endlessRecord(key) : null;
    return record && { id: "endless/" + key, record, titleKey: "endless.statsTitle", difficulty: endlessDifficulties[record.difficulty],
      name: TriCopy.t("endless.title", { difficulty: endlessDifficulties[record.difficulty], number: record.number }) };
  }
  const line = (text, className = "") => { const p = document.createElement("p"); p.textContent = text; p.className = className; return p; };
  // Time and rotation standings for one field of solvers.
  function statBlocks(stats, you) {
    const time = document.createElement("div"), turns = document.createElement("div");
    time.className = turns.className = "daily-stat";
    const median = TriCopy.t("daily.median", { time: formatTime(stats.time.median) });
    time.append(line(TriCopy.t("daily.time"), "daily-stat-label"),
      line(TriCopy.t("daily.timeLine", { time: formatTime(you.elapsedMs), top: you.timeTop }), "daily-stat-value"),
      histogram(stats.time.histogram, you.elapsedMs, { range: (a, b) => `${formatTime(a)}–${formatTime(b)}`,
        tick: formatTime, xTitle: TriCopy.t("daily.axisTime"), label: `${TriCopy.t("daily.time")} · ${median}`,
        marker: { value: stats.time.median, label: median, log: true } }));
    turns.append(line(TriCopy.t("daily.rotations"), "daily-stat-label"),
      line(TriCopy.t("daily.turnsLine", { count: you.turns, par: stats.turns.par, top: you.turnsTop }), "daily-stat-value"),
      histogram(stats.turns.histogram, you.turns, { range: (a, b) => b - a <= 1 ? String(a) : `${a}–${b - 1}`,
        // Rotation bins end exclusively, so the last edge is one past the highest count.
        tick: (value, end) => String(end ? Math.max(0, value - 1) : value),
        xTitle: TriCopy.t("daily.axisRotations"), label: TriCopy.t("daily.rotations") }));
    return [time, turns];
  }
  function section(text) {
    const heading = document.createElement("h3");
    heading.className = "daily-stats-section";
    heading.textContent = text;
    return heading;
  }
  function describeError(error) {
    if (error.reason === "disabled") return TriCopy.t("online.off");
    if (error.reason === "timeout") return TriCopy.t("daily.error.timeout", { seconds: TIMEOUT / 1000 });
    if (error.reason === "offline") return TriCopy.t(navigator.onLine === false ? "daily.error.noConnection" : "daily.error.offline");
    if (error.reason === "badReply") return TriCopy.t("daily.error.badReply");
    if (error.reason === "missing") return TriCopy.t("daily.error.missing");
    return TriCopy.t(error.detail ? "daily.error.httpDetail" : "daily.error.http", { status: error.status, message: error.detail });
  }
  // In place of the standings: what is happening, what last went wrong and,
  // once automatic retries stop, a way to try again.
  function unavailable(current, entry) {
    const record = current.record, busy = inflight.has(current.id), waiting = busy || !!entry?.timer;
    const nodes = [line(TriCopy.t(waiting ? (record.submitted ? "daily.loadingResults" : "daily.loadingStats")
      : record.submitted ? "daily.failed" : "daily.pending"), waiting ? "daily-stats-note daily-stats-loading" : "daily-stats-note")];
    if (waiting) nodes[0].setAttribute("role", "status");
    const reason = entry?.error ? describeError(entry.error)
      : record.refused ? TriCopy.t("daily.error.refused", { message: record.refused }) : "";
    if (reason) nodes.push(line(reason, "daily-stat-foot"));
    const attempt = entry ? entry.attempt + (busy ? 0 : 1) : 0;
    if (waiting && attempt > 0) nodes.push(line(TriCopy.t("daily.retrying", { attempt, max: RETRY_DELAYS.length }), "daily-stat-foot"));
    if (!waiting) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "daily-stats-retry";
      retry.textContent = TriCopy.t("daily.retry");
      retry.onclick = () => { settle(current.id); load(current.id); };
      nodes.push(retry);
    }
    return nodes;
  }
  function renderStats() {
    const current = subject(), record = current?.record;
    const available = !!(record?.solve && state?.won && !window.triMenuOpen);
    toggle.hidden = !available;
    toggle.setAttribute("aria-expanded", String(available && statsOpen));
    panel.hidden = !(available && statsOpen);
    if (panel.hidden) { renderedKey = ""; return; }
    // Engine state changes (hover, effects) arrive constantly; rebuild only on new content.
    const entry = trouble.get(current.id);
    const key = JSON.stringify([current.id, record.stats, record.submitted, record.refused, inflight.has(current.id),
      entry?.attempt, !!entry?.timer, entry?.error?.message, TriCopy.locale, TriMusic.canDownload]);
    if (key === renderedKey) return;
    renderedKey = key;
    const stats = record.stats, you = stats?.you;
    const heading = document.createElement("div");
    heading.className = "daily-stats-heading";
    heading.innerHTML = `<div class="daily-stats-titles"><h2 id="daily-stats-title">${TriCopy.html(current.titleKey)}</h2>`
      + `<span class="daily-stats-name"></span></div><button id="daily-stats-close" type="button">${TriCopy.html("daily.close")}</button>`;
    heading.querySelector(".daily-stats-name").textContent = current.name;
    const body = [heading];
    const solvers = () => section(TriCopy.t("daily.solvers", { count: stats.solvers }));
    if (!you) {
      body.push(...unavailable(current, entry));
    } else if (current.difficulty === undefined) {
      if (stats.solvers < 2) body.push(line(TriCopy.t("daily.first"), "daily-stats-note"));
      else body.push(solvers(), ...statBlocks(stats, you));
    } else {
      // Few people share any one Endless puzzle, so the whole difficulty follows it.
      if (stats.solvers < 2) body.push(line(TriCopy.t("endless.firstHere"), "daily-stats-note"));
      else body.push(solvers(), ...statBlocks(stats, you));
      if (stats.overall?.solvers > 1 && stats.overall.you)
        body.push(section(TriCopy.t("endless.allOf", { difficulty: current.difficulty, count: stats.overall.solvers })), ...statBlocks(stats.overall, stats.overall.you));
    }
    const share = el("share-result").cloneNode(true);
    share.removeAttribute("id");
    share.className = "daily-stats-share";
    share.onclick = () => el("share-result").click();
    body.push(share);
    // The music this solve played, if it was heard live on this visit.
    if (TriMusic.canDownload) {
      const music = document.createElement("button");
      music.type = "button";
      music.className = "daily-stats-music";
      music.textContent = TriCopy.t("music.save");
      music.title = TriCopy.t("music.saveDetails");
      const file = String(current.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      music.onclick = () => TriMusic.download("delta-triplex" + (file ? "-" + file : ""));
      body.push(music);
    }
    panel.replaceChildren(...body);
    el("daily-stats-close").onclick = () => { statsOpen = false; renderStats(); toggle.focus(); };
  }

  // Share the counted (first) solve, with its standing when known.
  window.triDailyBrag = (date, finished) => {
    const record = day(date);
    if (!record) return null;
    const solve = record.solve || { elapsed: finished.elapsed, turns: finished.turns }, you = record.stats?.you;
    const title = TriCopy.t("daily.shareTitle", { date: dateLabel(date, { month: "short", day: "numeric" }), name: record.name });
    const detail = you && record.stats.solvers > 1
      ? TriCopy.t("daily.shareStats", { time: formatTime(you.elapsedMs), timeTop: you.timeTop, count: you.turns, par: record.stats.turns.par })
      : TriCopy.t("daily.sharePlain", { time: formatTime(solve.elapsed), count: solve.turns });
    return { title: TriCopy.t("app.name"), text: `${title}\n${detail}`, url: `${TriShare.base}#daily=${date}` };
  };
  window.triEndlessBrag = (key, finished) => {
    const record = endlessRecord(key);
    if (!record) return null;
    const solve = record.solve || { elapsed: finished.elapsed, turns: finished.turns }, stats = record.stats;
    const difficulty = endlessDifficulties[record.difficulty], you = stats?.you, overall = stats?.overall;
    const title = TriCopy.t("endless.shareTitle", { difficulty, number: record.number });
    const detail = you && stats.solvers > 1
      ? TriCopy.t("daily.shareStats", { time: formatTime(you.elapsedMs), timeTop: you.timeTop, count: you.turns, par: stats.turns.par })
      : overall?.you && overall.solvers > 1
        ? TriCopy.t("endless.shareOverall", { time: formatTime(overall.you.elapsedMs), timeTop: overall.you.timeTop, difficulty, count: overall.you.turns })
        : TriCopy.t("daily.sharePlain", { time: formatTime(solve.elapsed), count: solve.turns });
    return { title: TriCopy.t("app.name"), text: `${title}\n${detail}`, url: `${TriShare.base}#endless=${key}` };
  };

  // Titles, stats visibility and the spark follow every state change.
  const baseFlow = window.triFlowState;
  let shownSubject = "";
  window.triFlowState = (next, previous) => {
    baseFlow(next, previous);
    // Reopening a solved Endless puzzle brings its standings up to date.
    const current = subject();
    if (current?.id !== shownSubject) {
      shownSubject = current?.id || "";
      if (current?.id.startsWith("endless/")) { statsOpen = false; refresh(current.id); }
    }
    const date = activeDaily();
    if (date && day(date)) {
      el("workshop-title").textContent = TriCopy.t("daily.title", { date: dateLabel(date), name: day(date).name });
      el("workshop-help").textContent = TriCopy.t(date === today() ? "daily.help" : "daily.pastHelp");
    }
    if (!next.won) statsOpen = false;
    renderStats();
  };
  const baseHome = window.triShowHome;
  window.triShowHome = (...args) => {
    baseHome(...args);
    renderStats();
    refreshList();
    syncSpark();
  };
  const basePlay = window.triShowPlay;
  window.triShowPlay = (...args) => { basePlay(...args); renderStats(); syncSpark(); };

  // ---- Sync code (Settings) --------------------------------------------------
  const sync = document.createElement("section");
  sync.id = "sync-section";
  sync.innerHTML = `<h3>${TriCopy.html("sync.title")}</h3>
    <p class="editor-note">${TriCopy.html("sync.help")}</p>
    <div class="menu-actions sync-actions"><button id="sync-show" type="button" aria-expanded="false">${TriCopy.html("sync.show")}</button><button id="sync-copy" type="button">${TriCopy.html("sync.copy")}</button></div>
    <output id="sync-code" hidden></output>
    <form id="sync-form"><label for="sync-input">${TriCopy.html("sync.enter")}</label><span class="sync-entry"><input id="sync-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"><button type="submit">${TriCopy.html("sync.use")}</button></span></form>
    <p id="sync-status" role="status"></p>`;
  el("menu-tools").previousElementSibling.before(sync);

  // ---- Online notice (Newgrounds only) -----------------------------------------
  const notice = el("online-notice");
  function setOnline(on) {
    const was = onlineAllowed();
    try { localStorage.setItem(ONLINE, on ? "on" : "off"); } catch {}
    el("online-switch").checked = el("online-notice-switch").checked = on;
    if (on && !was) { refreshList(true); reconnect(); }
    renderStats();
    window.triCalendarRefresh?.();
  }
  if (askOnline) {
    const toggle = document.createElement("label");
    toggle.htmlFor = "online-switch";
    toggle.innerHTML = `${TriCopy.html("online.switch")} <input id="online-switch" type="checkbox" role="switch" aria-describedby="online-help">`;
    const help = Object.assign(document.createElement("p"), { id: "online-help", className: "editor-note", textContent: TriCopy.t("online.help") });
    sync.querySelector("h3").after(toggle, help);
    el("online-switch").checked = onlineChoice() !== "off";
    el("online-switch").onchange = event => setOnline(event.target.checked);
  }
  window.triCloseOnlineNotice = () => {
    if (!notice.open) return;
    notice.close();
    setOnline(el("online-notice-switch").checked);
    el("app").inert = !!window.triMenuOpen || el("theme-welcome").open;
    window.triSyncHistory?.();
  };
  el("online-notice-continue").onclick = window.triCloseOnlineNotice;
  notice.addEventListener("cancel", event => { event.preventDefault(); window.triCloseOnlineNotice(); });
  if (askOnline && !onlineChoice()) {
    el("app").inert = true;
    notice.showModal();
    el("online-notice-continue").focus();
    window.triSyncHistory?.();
  }
  const syncStatus = message => { el("sync-status").textContent = message; };
  el("sync-show").onclick = () => {
    const output = el("sync-code"), code = playerCode();
    const show = output.hidden;
    output.hidden = !show;
    output.textContent = code ? groupCode(code) : TriCopy.t("sync.none");
    el("sync-show").textContent = TriCopy.t(show ? "sync.hide" : "sync.show");
    el("sync-show").setAttribute("aria-expanded", String(show));
  };
  el("sync-copy").onclick = async () => {
    const code = playerCode();
    if (!code) return syncStatus(TriCopy.t("sync.none"));
    try { await navigator.clipboard.writeText(groupCode(code)); syncStatus(TriCopy.t("sync.copied")); }
    catch { el("sync-code").hidden = false; el("sync-code").textContent = groupCode(code); }
  };
  el("sync-form").addEventListener("submit", async event => {
    event.preventDefault();
    const code = normalizeCode(el("sync-input").value);
    if (!SECRET.test(code)) return syncStatus(TriCopy.t("sync.invalid"));
    const current = playerCode();
    const solvedHere = Object.values(read().days).some(record => record.solve)
      || Object.values(window.TriEndless.read().puzzles).some(record => record.solve);
    if (current && current !== code && solvedHere && !confirm(TriCopy.t("sync.confirm"))) return;
    let me;
    try { me = await request("me", { secret: code }); } catch { return syncStatus(TriCopy.t("sync.offline")); }
    const data = read();
    data.player = code;
    const remote = new Map(me.solves.map(solve => [solve.date, solve]));
    for (const [date, record] of Object.entries(data.days)) {
      delete record.stats;
      // Dailies solved only on this device join the new code on the next submit.
      if (record.solve && !remote.has(date)) record.submitted = false;
    }
    for (const [date, solve] of remote)
      data.days[date] = { ...(data.days[date] || {}), solve: { elapsed: solve.elapsedMs, turns: solve.turns }, submitted: true };
    write(data);
    const store = window.TriEndless.read();
    const remoteEndless = new Map((me.endless || []).map(solve => [TriShare.endlessKey(solve.difficulty, solve.number), solve]));
    for (const [key, record] of Object.entries(store.puzzles)) {
      delete record.stats;
      if (record.solve && !remoteEndless.has(key)) record.submitted = false;
    }
    for (const [key, solve] of remoteEndless)
      store.puzzles[key] = { ...(store.puzzles[key] || {}), difficulty: solve.difficulty, number: solve.number,
        solve: { elapsed: solve.elapsedMs, turns: solve.turns }, submitted: true };
    window.TriEndless.write(store);
    el("sync-input").value = "";
    el("sync-code").hidden = true;
    el("sync-show").textContent = TriCopy.t("sync.show");
    syncStatus(me.known ? TriCopy.t("sync.done", { count: me.solves.length + remoteEndless.size }) : TriCopy.t("sync.unknown"));
    retryPending();
    window.triCalendarRefresh?.();
    syncSpark();
    const shown = subject();
    if (shown) refresh(shown.id);
  });

  // ---- Today's Puzzle spark --------------------------------------------------
  // A returning player who hasn't solved today's puzzle sees a spark run around
  // the button's edge, cycling through the spectrum and leaving a fading trail.
  const button = el("today-puzzle");
  const spark = svgNode("svg", { class: "daily-spark", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" });
  // Corners just inside the button's clip-path triangle: polygon(1% .5%, 99% .5%, 50% 99%).
  const CORNERS = [[4, 3], [96, 3], [50, 95]];
  const TRAIL = 40, SPAN = 0.0125, LAP = 3200, HUE_CYCLE = 4200;
  const segments = Array.from({ length: TRAIL }, () => svgNode("path", { "vector-effect": "non-scaling-stroke" }));
  spark.append(...segments);
  let sparkFrame = 0, sparkOn = false, edgeShare = [1 / 3, 1 / 3, 1 / 3];
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function wantSpark() {
    const days = read().days, date = today();
    const returning = Object.entries(days).some(([key, record]) => key !== date && (record.solve || Number(record.elapsed) > 0));
    const available = released ? released.has(date) : !!days[date]?.code;
    return returning && available && !days[date]?.solve;
  }
  // The viewBox stretches to the button, so weigh each edge by its on-screen length
  // to keep the spark's speed even all the way round.
  function measureEdges() {
    const { width, height } = button.getBoundingClientRect();
    if (!width || !height) return;
    const lengths = CORNERS.map(([x, y], i) => {
      const [nx, ny] = CORNERS[(i + 1) % 3];
      return Math.hypot((nx - x) * width, (ny - y) * height);
    });
    const total = lengths.reduce((a, b) => a + b);
    edgeShare = lengths.map(length => length / total);
  }
  function pointAt(t) {
    t = ((t % 1) + 1) % 1;
    for (let i = 0; i < 3; i++) {
      if (t <= edgeShare[i] || i === 2) {
        const u = Math.min(1, t / edgeShare[i]), [x, y] = CORNERS[i], [nx, ny] = CORNERS[(i + 1) % 3];
        return [x + (nx - x) * u, y + (ny - y) * u];
      }
      t -= edgeShare[i];
    }
  }
  // A piece of the outline from a to b (perimeter fractions), bending round corners.
  function piece(a, b) {
    const points = [pointAt(a)];
    let edgeStart = 0;
    for (let i = 0; i < 3; i++) {
      edgeStart += edgeShare[i];
      for (const corner of [edgeStart - 1, edgeStart, edgeStart + 1]) if (corner > a && corner < b) points.push(CORNERS[(i + 1) % 3]);
    }
    points.push(pointAt(b));
    return "M" + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L");
  }
  function paintSpark(now) {
    const still = !!reducedMotion?.matches;
    const head = (now / LAP) % 1;
    segments.forEach((segment, k) => {
      // Each trail piece keeps the hue the spark had when it passed there.
      const hue = still ? 360 * k / TRAIL : ((now - k * SPAN * LAP) / HUE_CYCLE * 360) % 360;
      const [a, b] = still ? [k / TRAIL, (k + 1) / TRAIL] : [head - (k + 1) * SPAN, head - k * SPAN];
      segment.setAttribute("d", piece(a, b + (still ? 0 : 0.002)));
      segment.setAttribute("stroke", `hsl(${hue.toFixed(1)} 100% 60%)`);
      segment.setAttribute("stroke-opacity", still ? 1 : ((1 - k / TRAIL) ** 1.5).toFixed(3));
      segment.setAttribute("stroke-width", still ? 4 : k === 0 ? 6.5 : 4.5);
      segment.setAttribute("stroke-linecap", k === 0 && !still ? "round" : "butt");
    });
  }
  function sparkLoop(now) {
    sparkFrame = 0;
    if (!sparkOn || el("home").hidden || el("home-main").hidden || document.hidden) return;
    paintSpark(now);
    if (!reducedMotion?.matches) sparkFrame = requestAnimationFrame(sparkLoop);
  }
  function syncSpark() {
    sparkOn = wantSpark();
    button.dataset.spark = String(sparkOn);
    if (sparkOn && !spark.isConnected) button.append(spark);
    if (sparkOn) measureEdges();
    if (!sparkOn) spark.remove();
    if (sparkOn && !sparkFrame) sparkFrame = requestAnimationFrame(sparkLoop);
  }
  document.addEventListener("visibilitychange", syncSpark);
  window.addEventListener("resize", () => { if (sparkOn) { measureEdges(); if (reducedMotion?.matches) paintSpark(0); } });
  reducedMotion?.addEventListener?.("change", syncSpark);
  window.triSyncSpark = syncSpark;

  refreshList(true);
  retryPending();
  syncSpark();
})();
