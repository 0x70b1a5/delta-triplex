"use strict";
// Navigation observes the same engine state for stock, imported and trial puzzles.
const endlessDifficulties = [TriCopy.t("ui.easy"), TriCopy.t("ui.medium"), TriCopy.t("ui.hard"), TriCopy.t("ui.impossible"), TriCopy.t("ui.sprout")];
const ENDLESS_PROGRESS = "tri-rotate-endless-v1";
let generationId = 0;
window.triEndlessRun = null;
window.triActiveSeedCode = "";
function readEndless() {
  try {
    const data = JSON.parse(localStorage.getItem(ENDLESS_PROGRESS));
    if (!data || typeof data.code !== "string") return null;
    return data;
  } catch { return null; }
}
function writeEndless(patch) {
  const next = { ...(readEndless() || {}), ...patch };
  try { localStorage.setItem(ENDLESS_PROGRESS, JSON.stringify(next)); } catch {}
}
function endlessRecent(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === "string").slice(-32) : [];
}
window.triReadEndlessProgress = function (code) {
  const data = readEndless();
  return data && data.code === code ? data : null;
};
window.triStoreEndlessRun = function (run, code) {
  writeEndless({
    code,
    difficulty: run.difficulty,
    number: run.number,
    recent: endlessRecent(run.recent),
    marks: "",
    elapsed: 0,
    turns: 0,
    view: 0,
    finished: null,
  });
};
window.triSaveEndlessProgress = function (code, progress) {
  const data = readEndless();
  if (!data || data.code !== code || !progress) return;
  const marks = typeof progress.marks === "string" && /^[012]*$/.test(progress.marks) ? progress.marks : data.marks;
  writeEndless({
    marks,
    elapsed: progress.elapsed,
    turns: progress.turns,
    view: progress.view,
    finished: progress.finished ?? null,
  });
};
window.triEndlessRunFromSave = function (saved) {
  const number = Number.isInteger(saved.number) && saved.number > 0 ? saved.number : 1;
  return { difficulty: saved.difficulty, number, recent: endlessRecent(saved.recent) };
};
function placeHash() {
  try {
    if (window.parent.location.origin === location.origin) return window.parent.location.hash;
  } catch {}
  return location.hash;
}
window.triReattachEndless = function () {
  if (window.triEndlessRun || window.triAuthorSession || !el("home").hidden || !state?.custom || state.editing) return;
  const code = window.triActiveSeedCode || "";
  if (!code || placeHash() !== "#seed=" + code) return;
  const saved = window.triReadEndlessProgress(code);
  if (!Number.isInteger(saved?.difficulty) || saved.difficulty < 0 || saved.difficulty > 4) return;
  window.triEndlessRun = window.triEndlessRunFromSave(saved);
};
window.triCancelGeneration = function () {
  generationId++;
  el("difficulties").removeAttribute("aria-busy");
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
  window.triClearEndlessPlace?.();
  el("endless-note").textContent = "";
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
  if (next.custom && window.triEndlessRun && window.triActiveSeedCode)
    window.triSetEndlessPlace?.(window.triActiveSeedCode);
  else if (next.custom && !next.editing && window.triActiveDaily)
    window.triSetPlace?.("#daily=" + window.triActiveDaily);
  else window.triSetEndlessPlace?.("");
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
    loadCustom(puzzle, false, false);
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
// Each attempt is bounded, and yielding between batches keeps navigation responsive.
async function startEndless(difficulty, number = 1, recent = []) {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  window.triCancelGeneration();
  const job = generationId;
  el("difficulties").setAttribute("aria-busy", "true");
  el("endless-note").textContent =
    TriCopy.t("endless.creating", { difficulty: TriCopy.t("difficulty." + difficulty + ".sentence") });
  el("next-puzzle").disabled = true;
  el("next-puzzle").setAttribute("aria-label", TriCopy.t("flow.creating-puzzle"));
  try {
    for (let attempt = 0; attempt < 2000; attempt++) {
      if (attempt % 4 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
      if (job !== generationId) return;
      const seed = window.crypto.getRandomValues(new Uint32Array(1))[0];
      const json = Module.ccall(
        "game_generate",
        "string",
        ["number", "number"],
        [difficulty, seed],
      );
      if (!json) continue;
      const puzzle = JSON.parse(json),
        signature = puzzle.solution.join("");
      if (recent.includes(signature)) continue;
      puzzle.seed = seed;
      puzzle.difficulty = difficulty;
      puzzle.name = TriCopy.t("endless.name", { difficulty: endlessDifficulties[difficulty], number });
      loadCustom(puzzle, false, false, {
        difficulty,
        number,
        recent: [...recent.slice(-31), signature],
      });
      return;
    }
    throw Error(TriCopy.t("errors.generationTimeout"));
  } catch (error) {
    if (job !== generationId) return;
    el("endless-note").textContent = error.message;
    toast(error.message);
  } finally {
    if (job === generationId) window.triCancelGeneration();
  }
}
[...el("difficulties").children].forEach(button => {
  const difficulty = Number(button.dataset.difficulty);
  const detail = document.createElement("small");
  button.title = TriCopy.t("difficulty." + difficulty + ".description");
  detail.textContent = TriCopy.t("difficulty.cells", { count: [16, 36, 64, 100, 9][difficulty] });
  button.append(detail);
  button.onclick = () => startEndless(difficulty);
});
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
      startEndless(run.difficulty, run.number + 1, run.recent);
    } else if (window.triAuthorSession) call("editing", 1);
    else window.triShowHome();
  } else if (state.tutorial >= 0 && state.tutorial < 2) call("next");
  else window.triShowHome();
};
el("continue").onclick = () => el("next-puzzle").click();
if (appReady) window.triInitializeCustom();
