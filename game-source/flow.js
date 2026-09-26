"use strict";
// Navigation observes the same engine state for stock, imported and trial puzzles.
const endlessDifficulties = [TriCopy.t("ui.easy"), TriCopy.t("ui.medium"), TriCopy.t("ui.hard"), TriCopy.t("ui.impossible"), TriCopy.t("ui.sprout")];
// Endless puzzles are numbered per difficulty (TriShare.endlessKey, e.g. "hard-12").
// tri-endless-v2 keeps each one's progress and first solve, and the number last
// opened in each difficulty. daily.js submits the solves and reads their stats.
const ENDLESS_STORE = "tri-endless-v2";
window.triEndlessRun = null;
window.triActiveEndless = "";
window.triActiveSeedCode = "";
window.TriEndless = {
  read() {
    try {
      const data = JSON.parse(localStorage.getItem(ENDLESS_STORE));
      if (data && typeof data === "object" && data.puzzles && typeof data.puzzles === "object")
        return { ...data, current: data.current && typeof data.current === "object" ? data.current : {} };
    } catch {}
    return { current: {}, puzzles: {} };
  },
  write(data) {
    try { localStorage.setItem(ENDLESS_STORE, JSON.stringify(data)); } catch {}
  },
  record(key) { return this.read().puzzles[key] || null; },
  update(key, patch) {
    const data = this.read();
    data.puzzles[key] = { ...(data.puzzles[key] || {}), ...patch };
    this.write(data);
    return data.puzzles[key];
  },
  // Solved puzzles per difficulty ID.
  solvedCounts() {
    const counts = [0, 0, 0, 0, 0];
    for (const record of Object.values(this.read().puzzles))
      if (record?.solve && counts[record.difficulty] !== undefined) counts[record.difficulty]++;
    return counts;
  },
  // The lowest unsolved number from `from`; null once a finite difficulty is done.
  nextUnsolved(difficulty, from) {
    const { puzzles } = this.read(), count = Module.ccall("game_endless_count", "number", ["number"], [difficulty]);
    let number = Math.max(1, from);
    while (puzzles[TriShare.endlessKey(difficulty, number)]?.solve) number++;
    return count && number > count ? null : number;
  },
};
window.triReadEndlessProgress = key => window.TriEndless.record(key);
window.triSaveEndlessProgress = function (key, progress) {
  if (!window.TriEndless.record(key) || !progress) return;
  const marks = typeof progress.marks === "string" && /^[012]*$/.test(progress.marks) ? { marks: progress.marks } : {};
  window.TriEndless.update(key, {
    ...marks,
    elapsed: progress.elapsed,
    turns: progress.turns,
    view: progress.view,
    finished: progress.finished ?? null,
  });
};
function placeHash() {
  try {
    if (window.parent.location.origin === location.origin) return window.parent.location.hash;
  } catch {}
  return location.hash;
}
// Browser Forward back onto a numbered puzzle resumes it as Endless.
window.triReattachEndless = function () {
  if (window.triEndlessRun || window.triAuthorSession || !el("home").hidden || !state?.custom || state.editing) return;
  const key = window.triActiveEndless || "";
  if (!key || placeHash() !== "#endless=" + key) return;
  window.triEndlessRun = TriShare.parseEndless(key);
};
window.triCancelGeneration = function () {
  el("next-puzzle").disabled = false;
  el("next-puzzle").setAttribute("aria-label", TriCopy.t("ui.next-puzzle"));
};
window.triMenuOpen = true;
window.triShowHome = function (view = "main") {
  window.triCloseIntro?.();
  window.triClosePuzzleLoader?.();
  window.triCloseThemeWelcome?.();
  window.triHomePrepare?.(view);
  window.triCancelGeneration();
  window.triEndlessRun = null;
  window.triClearPlace?.();
  el("endless-note").textContent = "";
  if (view === "endless") syncEndlessMenu();
  call("up");
  call("clear_effects");
  window.triMenuOpen = true;
  el("home").dataset.view = view;
  el("home").hidden = false;
  el("app").inert = true;
  el("completion").hidden = true;
  toggleMenu(false);
  for (const name of ["main", "calendar", "endless"])
    el("home-" + name).hidden = name !== view;
  el("home-back").hidden = view === "main";
  el("load-error").hidden = true;
  window.triHomeChanged?.();
  el(view === "main" ? "today-puzzle" : "home-back").focus();
  window.triSyncHistory?.();
  window.triPublishPlace?.();
};
window.triShowPlay = function () {
  window.triCloseIntro?.();
  window.triMenuOpen = false;
  el("home").hidden = true;
  window.triHomeChanged?.();
  el("app").inert = false;
  toggleMenu(false);
  window.triMaybeChooseTheme?.();
  requestFrame();
  window.triSyncHistory?.();
};
window.triFlowState = function (next, previous) {
  if (!next.custom) window.triEndlessRun = null;
  if (next.custom && window.triEndlessRun && window.triActiveEndless)
    window.triSetPlace?.("#endless=" + window.triActiveEndless);
  else if (next.custom && !next.editing && window.triActiveDaily)
    window.triSetPlace?.("#daily=" + window.triActiveDaily);
  else window.triSetPlace?.("");
  el("editor-test").hidden = !!window.triEndlessRun || !window.triAuthorSession;
  if (next.custom && window.triEndlessRun) {
    const run = window.triEndlessRun;
    el("workshop-title").textContent =
      TriCopy.t("endless.title", { difficulty: endlessDifficulties[run.difficulty], number: run.number });
    el("workshop-help").textContent =
      TriCopy.t("endless.help", { count: next.n * next.n });
  }
  const solved = !!next.won && !next.editing;
  // Visibility preserves layout, so the puzzle does not jump as the clues vanish.
  el("clues").style.visibility = solved ? "hidden" : "";
  el("clues").inert = solved;
  el("clues").setAttribute("aria-hidden", String(solved));
  el("strip-label").hidden = solved;
  el("completion").hidden = !solved || window.triMenuOpen;
  el("continue").hidden = true;
  el("next-puzzle").setAttribute("aria-label", TriCopy.t("ui.next-puzzle"));
  const sameBoard =
    previous &&
    previous.level === next.level &&
    previous.tutorial === next.tutorial &&
    previous.revision === next.revision &&
    previous.custom === next.custom;
  if (solved && sameBoard && !previous.won) call("celebrate");
  if (!solved) call("clear_celebration");
};
el("today-puzzle").onclick = () => window.triPlayToday();
el("past-puzzles").onclick = () => window.triOpenCalendar(false);
el("how-to-play").onclick = () => {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  call("replay");
  window.triShowPlay();
};
el("skip").onclick = () => window.triShowHome();
el("endless-mode").onclick = () => window.triShowHome("endless");
el("home-back").onclick = () => window.triShowHome();
el("return-home").onclick = () => window.triShowHome();
el("create-puzzle").onclick = () => el("editor-open").click();
const loadDialog = el("load-dialog");
window.triOpenPuzzleLoader = (code = "") => {
  el("puzzle-code").value = code;
  el("load-code-error").hidden = true;
  el("app").inert = true;
  if (!loadDialog.open) loadDialog.showModal();
  call("sync");
  el("puzzle-code").focus();
  window.triSyncHistory?.();
};
window.triClosePuzzleLoader = () => {
  if (!loadDialog.open) return;
  loadDialog.close();
  el("app").inert = !!window.triMenuOpen || el("theme-welcome").open;
  call("sync");
  (window.triMenuOpen ? el("load-puzzle") : el("rotate-board"))?.focus({ preventScroll: true });
  window.triSyncHistory?.();
};
el("load-puzzle").onclick = () => window.triOpenPuzzleLoader();
el("load-cancel").onclick = window.triClosePuzzleLoader;
loadDialog.addEventListener("cancel", event => { event.preventDefault(); window.triClosePuzzleLoader(); });
el("load-code-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    if (!appReady) throw Error(TriCopy.t("errors.loading"));
    const puzzle = TriShare.fromText(el("puzzle-code").value);
    window.triClosePuzzleLoader();
    if (puzzle.endless) startEndless(puzzle.difficulty, puzzle.number);
    else loadCustom(puzzle, false, false);
  } catch (error) {
    el("load-code-error").textContent = error.message;
    el("load-code-error").hidden = false;
    el("puzzle-code").focus();
  }
});
el("load-json-file").onclick = () => {
  window.triClosePuzzleLoader();
  el("puzzle-file").value = "";
  el("puzzle-file").click();
};
// Opens Endless puzzle `number`, by default the one this difficulty was last
// on, or the next unsolved one after it.
function startEndless(difficulty, number, fromLink = false) {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  window.triCancelGeneration();
  const data = window.TriEndless.read();
  if (number === undefined) number = window.TriEndless.nextUnsolved(difficulty, Number(data.current[difficulty]) || 1);
  const puzzle = number && TriShare.endlessPuzzle(difficulty, number);
  const name = TriCopy.t("difficulty." + difficulty + ".sentence");
  if (!puzzle) {
    window.triShowHome("endless");
    el("endless-note").textContent = TriCopy.t("endless.complete", { difficulty: name });
    return;
  }
  data.current[difficulty] = number;
  window.TriEndless.write(data);
  loadCustom(puzzle, false, false, { difficulty, number }, fromLink);
}
window.triStartEndless = startEndless;
const difficultyBadges = new Map();
[...el("difficulties").children].forEach(button => {
  const difficulty = Number(button.dataset.difficulty);
  const detail = document.createElement("small");
  button.title = TriCopy.t("difficulty." + difficulty + ".description");
  detail.textContent = TriCopy.t("difficulty.cells", { count: [16, 36, 64, 100, 9][difficulty] });
  // Solved count: a filled point-down triangle under the cell count.
  const badge = document.createElement("b"), count = document.createElement("span"), spoken = document.createElement("span");
  badge.className = "solve-badge";
  count.setAttribute("aria-hidden", "true");
  spoken.className = "theme-sr-only";
  badge.append(count, spoken);
  button.append(detail, badge);
  difficultyBadges.set(difficulty, { badge, count, spoken });
  button.onclick = () => startEndless(difficulty);
});
// Menu order, which is also the order solved counts are listed in.
const endlessOrder = [4, 0, 1, 2, 3];
function syncEndlessMenu() {
  const counts = window.TriEndless.solvedCounts();
  for (const [difficulty, { badge, count, spoken }] of difficultyBadges) {
    badge.hidden = !counts[difficulty];
    badge.dataset.digits = String(Math.min(4, String(counts[difficulty]).length));
    count.textContent = String(counts[difficulty]);
    spoken.textContent = TriCopy.t("endless.solvedCount", { count: counts[difficulty] });
  }
}
syncEndlessMenu();
// Solved counts per difficulty, leaving out difficulties with none.
const recordDialog = el("endless-record");
window.triOpenEndlessRecord = () => {
  const counts = window.TriEndless.solvedCounts();
  const rows = endlessOrder.filter(difficulty => counts[difficulty]).map(difficulty => {
    const row = document.createElement("li");
    const label = document.createElement("span"), value = document.createElement("strong");
    label.textContent = endlessDifficulties[difficulty];
    value.textContent = String(counts[difficulty]);
    row.append(label, value);
    return row;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  el("endless-record-list").replaceChildren(...rows);
  el("endless-record-list").hidden = !rows.length;
  el("endless-record-total").textContent = total
    ? TriCopy.t("endless.recordTotal", { count: total }) : TriCopy.t("endless.recordNone");
  el("app").inert = true;
  if (!recordDialog.open) recordDialog.showModal();
  el("endless-record-close").focus();
  window.triSyncHistory?.();
};
window.triCloseEndlessRecord = () => {
  if (!recordDialog.open) return;
  recordDialog.close();
  el("app").inert = !!window.triMenuOpen || el("theme-welcome").open;
  el("endless-stats")?.focus({ preventScroll: true });
  window.triSyncHistory?.();
};
el("endless-stats").onclick = window.triOpenEndlessRecord;
el("endless-record-close").onclick = window.triCloseEndlessRecord;
recordDialog.addEventListener("cancel", event => { event.preventDefault(); window.triCloseEndlessRecord(); });
el("puzzle-file").onchange = async () => {
  const file = el("puzzle-file").files?.[0];
  if (!file) return;
  try {
    if (!appReady) throw Error(TriCopy.t("errors.loadingRetry"));
    if (file.size > 65536)
      throw Error(TriCopy.t("errors.fileSize"));
    const puzzle = JSON.parse(await file.text());
    if (
      !validPuzzle(puzzle) ||
      (puzzle.format && puzzle.format !== "tri-logic") ||
      (puzzle.version && ![2, 3].includes(puzzle.version)) ||
      (puzzle.cellOrder && puzzle.cellOrder !== "north-row-major")
    )
      throw Error(
        TriCopy.t("errors.fileUnsupported"),
      );
    loadCustom(puzzle, false, false);
  } catch (error) {
    el("load-error").textContent =
      error instanceof SyntaxError
        ? TriCopy.t("errors.fileJson")
        : error.message;
    el("load-error").hidden = false;
  }
};
el("next-puzzle").onclick = () => {
  if (!state?.won) return;
  call("clear_effects");
  if (state.custom) {
    if (window.triEndlessRun) {
      const run = window.triEndlessRun;
      startEndless(run.difficulty, window.TriEndless.nextUnsolved(run.difficulty, run.number + 1));
    } else if (window.triAuthorSession) call("editing", 1);
    else window.triShowHome();
  } else if (state.tutorial >= 0 && state.tutorial < 2) call("next");
  else window.triShowHome();
};
el("continue").onclick = () => el("next-puzzle").click();
if (appReady) window.triInitializeCustom();
