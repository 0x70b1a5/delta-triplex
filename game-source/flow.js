"use strict";
// Navigation observes the same engine state for stock, imported and trial puzzles.
const endlessDifficulties = [TriCopy.t("ui.easy"), TriCopy.t("ui.medium"), TriCopy.t("ui.hard"), TriCopy.t("ui.impossible"), TriCopy.t("ui.sprout")];
let generationId = 0;
window.triEndlessRun = null;
window.triCancelGeneration = function () {
  generationId++;
  el("difficulties").removeAttribute("aria-busy");
  el("next-puzzle").disabled = false;
  el("next-puzzle").setAttribute("aria-label", TriCopy.t("ui.next-puzzle"));
};
window.triMenuOpen = true;
window.triShowHome = function (view = "main") {
  window.triCloseThemeWelcome?.();
  window.triHomePrepare?.(view);
  window.triCancelGeneration();
  window.triEndlessRun = null;
  el("endless-note").textContent = "";
  call("up");
  call("clear_effects");
  window.triMenuOpen = true;
  el("home").dataset.view = view;
  el("home").hidden = false;
  el("app").inert = true;
  el("completion").hidden = true;
  toggleMenu(false);
  for (const name of ["main", "levels", "endless"])
    el("home-" + name).hidden = name !== view;
  el("home-back").hidden = view === "main";
  el("load-error").hidden = true;
  window.triHomeChanged?.();
  el(view === "main" ? "new-game" : "home-back").focus();
  window.triSyncHistory?.();
};
window.triShowPlay = function () {
  window.triMenuOpen = false;
  el("home").hidden = true;
  window.triHomeChanged?.();
  el("app").inert = false;
  toggleMenu(false);
  window.triMaybeChooseTheme?.();
  requestFrame();
  window.triSyncHistory?.();
};
function openLevel(index) {
  window.triCancelGeneration();
  window.triEndlessRun = null;
  window.triShowPlay();
  call("level", index);
}
let levelListKey = "";
window.triBuildLevels = function (names) {
  if (!names) return;
  const key = JSON.stringify(names);
  if (key !== levelListKey) {
    levelListKey = key;

    el("level-grid").replaceChildren();
    names.forEach((name, index) => {
      const tile = document.createElement("button");
      tile.id = "level-" + index;
      tile.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("small");
      label.textContent = TriCopy.has(name) ? TriCopy.t(name) : name;
      tile.append(label);
      tile.onclick = () => openLevel(index);
      el("level-grid").append(tile);
    });
    window.triHomeLayout?.();
  }
  names.forEach((_, i) =>
    el("level-" + i).setAttribute(
      "aria-pressed",
      String(!state.custom && state.tutorial < 0 && state.level === i),
    ),
  );
};
window.triFlowState = function (next, previous) {
  if (!next.custom) window.triEndlessRun = null;
  el("editor-test").hidden = !!window.triEndlessRun;
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
el("new-game").onclick = () => {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  window.triShowPlay();
  call("new");
};
el("select-level").onclick = () => window.triShowHome("levels");
el("endless-mode").onclick = () => window.triShowHome("endless");
el("home-back").onclick = () => window.triShowHome();
el("return-home").onclick = () => window.triShowHome();
el("create-puzzle").onclick = () => el("editor-open").click();
el("load-puzzle").onclick = () => {
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
      (puzzle.version && puzzle.version !== 2) ||
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
    } else if (authorSession) call("editing", 1);
    else window.triShowHome();
  } else if (state.tutorial >= 0) call("next");
  else if (state.level + 1 < state.levels.length) openLevel(state.level + 1);
  else window.triShowHome();
};
window.triBuildLevels(state?.levels);
if (appReady) window.triInitializeCustom();
