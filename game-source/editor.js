"use strict";

// The editor supplies data and mode controls. The C engine and app.js own every
// board, clue, interaction, history operation and effect, including exported play.
const exportTemplate = document.documentElement.cloneNode(true);
for (const id of ["levels", "clues", "strip-label"])
  exportTemplate.querySelector("#" + id)?.replaceChildren();
exportTemplate.querySelector("#embedded-puzzle")?.remove();
const menu = el("puzzle-menu");

el("menu-tools").append(el("utilities"));
el("utilities").hidden = false;
let homeMenuState = null;
function toggleMenu(open) {
  const fromHome = open && !el("home").hidden;
  const returnToHome = !!homeMenuState;
  if (homeMenuState && !fromHome) {
    for (const [control, disabled] of homeMenuState.controls) control.disabled = disabled;
    for (const [section, hidden] of homeMenuState.sections) section.hidden = hidden;
    homeMenuState = null;
  }
  if (fromHome && !homeMenuState) {
    const controls = [...menu.querySelectorAll('#return-home, #editor-open, #editor-settings input, #editor-settings select, #editor-settings button')];
    homeMenuState = { controls: controls.map(control => [control, control.disabled]),
      sections: ["return-home", "menu-create", "editor-settings"].map(id => [el(id), el(id).hidden]) };
    controls.forEach(control => { control.disabled = true; });
    for (const [section] of homeMenuState.sections) section.hidden = true;
  }
  menu.hidden = !open;
  el("home").inert = fromHome;
  el("home-settings").setAttribute("aria-expanded", String(fromHome));
  el("menu-toggle").setAttribute("aria-expanded", String(open && !fromHome));
  (open ? el("menu-close") : returnToHome ? el("home-settings") : el("menu-toggle")).focus();
  window.triSyncHistory?.();
}
el("home-settings").onclick = () => toggleMenu(true);
el("menu-toggle").onclick = () => toggleMenu(menu.hidden);
el("menu-close").onclick = () => toggleMenu(false);
el("replay").onclick = () => {
  call("replay");
  window.triShowPlay?.();
  toggleMenu(false);
};
el("memory").onclick = () => {
  toggleMenu(false);
  memoryToggle(true);
};
// Retain the keyboard shortcut without hiding menu contents.
el("caret").onclick = () => toggleMenu(menu.hidden);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) toggleMenu(false);
});
document.addEventListener("pointerdown", (event) => {
  if (
    !menu.hidden &&
    !menu.contains(event.target) &&
    !el("menu-toggle").contains(event.target)
  )
    toggleMenu(false);
});

// Orientation counts clockwise 120° turns from the canonical base-up view.
const orientations = [0, 1, 2];
function validPuzzle(value) {
  return (
    value &&
    Number.isInteger(value.size) &&
    value.size >= 2 &&
    value.size <= 10 &&
    Array.isArray(value.solution) &&
    value.solution.length === value.size ** 2 &&
    value.solution.every((v) => v === 0 || v === 1) &&
    (value.orientation === undefined || orientations.includes(value.orientation))
  );
}
function normalizePuzzle(value) {
  return {
    format: "tri-logic",
    version: 3,
    cellOrder: "north-row-major",
    name: String(value.name || TriCopy.t("editor.my-puzzle")).slice(0, 80),
    size: value.size,
    solution: value.solution.slice(),
    orientation: orientations.includes(value.orientation) ? value.orientation : 0,
    ...(Number.isInteger(value.seed) &&
    value.seed >= 0 &&
    value.seed <= 0xffffffff &&
    Number.isInteger(value.difficulty) &&
    value.difficulty >= 0 &&
    value.difficulty <= 4
      ? { seed: value.seed, difficulty: value.difficulty }
      : {}),
    ...endlessIdentity(value),
  };
}
// Keeps a numbered Endless identity only while the board still is that puzzle.
function endlessIdentity(value) {
  if (typeof value.endless !== "string") return {};
  try {
    const { difficulty, number } = TriShare.parseEndless(value.endless);
    const puzzle = TriShare.endlessPuzzle(difficulty, number);
    if (puzzle && puzzle.solution.join("") === value.solution.join(""))
      return { endless: puzzle.endless, difficulty, number };
  } catch {}
  return {};
}
let draft;
try {
  draft = JSON.parse(localStorage.getItem("tri-rotate-editor-v1"));
} catch {}
if (!validPuzzle(draft))
  draft = {
    name: TriCopy.t("editor.my-puzzle"),
    size: 5,
    solution: Array(25).fill(0),
  };
draft = normalizePuzzle(draft);
let currentPuzzle = null,
  authorSession = false,
  sharedArrival = false;
window.triAuthorSession = false;
window.triActiveDaily = "";

const settings = document.createElement("section");
settings.id = "editor-settings";
settings.hidden = true;
settings.innerHTML = `<h3>${TriCopy.html("editor.puzzle-settings")}</h3><label>${TriCopy.html("editor.name")} <input id="editor-name" maxlength="80"></label><label>${TriCopy.html("editor.size")} <select id="editor-size">${Array.from({ length: 9 }, (_, i) => `<option>${i + 2}</option>`).join("")}</select></label><p class="editor-note">${TriCopy.html("editor.settingsHelp")}</p><h3>${TriCopy.html("editor.exportHeading")}</h3><div class="menu-actions"><button id="editor-export">${TriCopy.html("editor.export-playable-html")}</button><button id="editor-json">${TriCopy.html("editor.export-puzzle-json")}</button><button id="editor-share">${TriCopy.html("editor.copy-puzzle-link")}</button></div><input id="share-output" aria-label="${TriCopy.html("editor.puzzle-link")}" readonly hidden>`;
menu.insertBefore(settings, el("menu-tools").previousElementSibling);
const workshop = document.createElement("section");
workshop.id = "workshop";
workshop.hidden = true;
workshop.innerHTML = `<div id="workshop-title"></div><p id="workshop-help"></p><div class="lesson-actions" id="workshop-actions"><button id="editor-new" type="button" aria-haspopup="dialog">${TriCopy.html("editor.new")}</button><button id="editor-test">${TriCopy.html("editor.try")}</button><button id="editor-solubility" type="button" aria-haspopup="dialog" hidden></button></div>`;
el("side").insertBefore(workshop, el("corner"));
el("bottom-controls").prepend(el("workshop-actions"));
const shareHelp = document.createElement("button");
shareHelp.id = "share-help";
shareHelp.type = "button";
shareHelp.hidden = true;
shareHelp.textContent = TriCopy.t("share.howToPlay");
el("bottom-controls").prepend(shareHelp);
shareHelp.onclick = () => window.triStartIntro?.({ returnToPuzzle: true });
menu.append(el("controls-hint"));
function saveDraft() {
  try {
    localStorage.setItem("tri-rotate-editor-v1", JSON.stringify(draft));
  } catch {}
}
// The solution as engine marks, in game_custom's tile order.
function solvedMarks(puzzle) {
  const n = puzzle.size;
  let marks = "";
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) for (let o = 0; o < 2; o++) {
    const r = i + j + o;
    if (r < n) marks += puzzle.solution[r * r + 2 * i + o] ? "1" : "0";
  }
  return marks;
}
// daily is the puzzle's date (YYYY-MM-DD) when it is a daily puzzle; endlessRun
// is { difficulty, number } for a numbered Endless puzzle.
function loadCustom(puzzle, editing, ownsDraft, endlessRun = null, fromLink = false, daily = "") {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  if (!validPuzzle(puzzle)) return toast(TriCopy.t("editor.invalid-puzzle-data"));
  window.triCancelGeneration?.();
  window.triEndlessRun = endlessRun;
  window.triActiveDaily = daily;
  currentPuzzle = normalizePuzzle(puzzle);
  window.triActiveSeedCode = TriShare.seedCode(currentPuzzle.seed, currentPuzzle.difficulty) || "";
  window.triActiveEndless = endlessRun ? TriShare.endlessKey(endlessRun.difficulty, endlessRun.number) : "";
  const resumed = endlessRun ? window.triReadEndlessProgress?.(window.triActiveEndless)
    : daily ? window.triReadDailyProgress?.(daily) : null;
  if (endlessRun && !resumed)
    window.TriEndless.update(window.triActiveEndless, { difficulty: endlessRun.difficulty, number: endlessRun.number });
  // A solved puzzle reopens solved; Reset starts a replay.
  const marks = resumed?.solve ? solvedMarks(currentPuzzle) : resumed?.marks;
  const resumeMarks = typeof marks === "string" && marks.length === currentPuzzle.size * currentPuzzle.size && /^[012]+$/.test(marks) ? marks : "";
  Module.ccall("game_resume_marks", null, ["string"], [resumeMarks]);
  // The counted solve was submitted on an earlier visit, so it reopens solved.
  if (resumeMarks && resumed?.solve) Module.ccall("game_resume_solved", null, ["number"], [1]);
  window.triShowPlay?.();
  authorSession = !!ownsDraft;
  window.triAuthorSession = authorSession;
  sharedArrival = !!fromLink && !authorSession;
  const ok = Module.ccall(
    "game_custom",
    "number",
    ["number", "number", "string", "number"],
    [
      currentPuzzle.size,
      0,
      currentPuzzle.solution.join(""),
      editing ? 1 : 0,
    ],
  );
  if (!ok) toast(TriCopy.t("editor.the-puzzle-could-not-be-loaded"));
}
// Warns while editing when the clues have several answers or need guessing.
// Large boards can take a moment to check, so it waits for painting to pause.
const solubilityKinds = [null, "guessing", "ambiguous", "unknown"];
let solubilityKey = "", solubilityKind = null, solubilityTimer = 0;
function syncSolubility(next) {
  const button = el("editor-solubility");
  const active = !!next?.custom && next.editing && authorSession && !window.triEndlessRun && !!currentPuzzle;
  clearTimeout(solubilityTimer);
  if (!active) { button.hidden = true; return; }
  const key = currentPuzzle.size + ":" + currentPuzzle.solution.join("");
  const show = () => {
    button.hidden = !solubilityKind;
    if (solubilityKind) button.textContent = TriCopy.t("editor.solubility." + solubilityKind);
  };
  if (key === solubilityKey) return show();
  solubilityTimer = setTimeout(() => {
    solubilityKey = key;
    solubilityKind = solubilityKinds[Module.ccall("game_solubility", "number", ["number", "string"],
      [currentPuzzle.size, currentPuzzle.solution.join("")])] || null;
    show();
  }, 200);
}
const solubilityDialog = el("solubility-dialog");
el("editor-solubility").onclick = () => {
  if (!solubilityKind) return;
  el("solubility-title").textContent = TriCopy.t(`editor.solubility.${solubilityKind}Title`);
  el("solubility-text").textContent = TriCopy.t(`editor.solubility.${solubilityKind}Text`);
  el("app").inert = true;
  if (!solubilityDialog.open) solubilityDialog.showModal();
  el("solubility-close").focus();
  window.triSyncHistory?.();
};
window.triCloseSolubility = () => {
  if (!solubilityDialog.open) return;
  solubilityDialog.close();
  el("app").inert = !!window.triMenuOpen || el("theme-welcome").open;
  el("editor-solubility").focus({ preventScroll: true });
  window.triSyncHistory?.();
};
el("solubility-close").onclick = window.triCloseSolubility;
solubilityDialog.addEventListener("cancel", event => { event.preventDefault(); window.triCloseSolubility(); });
function syncVisitorControls(next) {
  const author = authorSession && !window.triEndlessRun;
  const showHelp = sharedArrival && !!next?.custom && !authorSession && !next.editing && !next.won && el("home").hidden;
  el("editor-test").hidden = !author;
  el("editor-new").hidden = !author || !next?.editing;
  shareHelp.hidden = !showHelp;
  el("workshop-actions").hidden = !next?.custom || !author;
}
window.triCustomState = (next) => {
  const active = !!next.custom;
  workshop.hidden = !active;
  // Puzzle settings (name, size, export) only apply while editing.
  settings.hidden = !active || !next.editing || !!homeMenuState;
  syncVisitorControls(next);
  if (!active || !currentPuzzle) {
    el("reset").title = TriCopy.t("ui.reset-r-undo-restores-it");
    return;
  }
  currentPuzzle.solution = next.solution.slice();
  currentPuzzle.size = next.n;
  currentPuzzle.clues = next.clues.map((axis) =>
    axis.map((line) => line.runs.slice()),
  );
  if (authorSession) {
    delete currentPuzzle.seed;
    delete currentPuzzle.difficulty;
    delete currentPuzzle.endless;
    delete currentPuzzle.number;
    draft = normalizePuzzle(currentPuzzle);
    saveDraft();
  }
  el("workshop-title").textContent =
    TriCopy.t(next.editing ? "editor.editingTitle" : "editor.tryingTitle", { name: currentPuzzle.name });
  el("workshop-help").textContent = next.editing
    ? TriCopy.t("editor.paintHelp")
    : TriCopy.t("editor.playHelp");
  el("editor-test").textContent = next.editing ? TriCopy.t("editor.try") : TriCopy.t("editor.edit");
  syncSolubility(next);
  el("editor-name").value = currentPuzzle.name;
  el("editor-size").value = String(next.n);
  el("editor-size").disabled = !!homeMenuState || !next.editing;
  el("reset").title = next.editing
    ? TriCopy.t("editor.clear-solution-r-undo-restores-it")
    : TriCopy.t("ui.reset-r-undo-restores-it");
};
// Turning the board while editing sets how the puzzle opens and is revealed.
window.triSetPuzzleOrientation = (view) => {
  if (!currentPuzzle || !authorSession) return;
  currentPuzzle.orientation = view;
  draft = normalizePuzzle(currentPuzzle);
  saveDraft();
};
// New puzzle: name and size, or back to the saved draft when one exists.
const newDialog = el("new-puzzle-dialog");
el("new-puzzle-size").innerHTML = Array.from({ length: 9 }, (_, i) => `<option>${i + 2}</option>`).join("");
let newOpener = null;
const draftStarted = () => draft.solution.some(Boolean);
window.triOpenNewPuzzle = (opener) => {
  newOpener = opener;
  const editingDraft = authorSession && !!state?.custom && state.editing;
  el("new-puzzle-name").value = "";
  el("new-puzzle-name").placeholder = TriCopy.t("editor.my-puzzle");
  el("new-puzzle-size").value = String(draft.size);
  // From the editor the draft is already open; elsewhere it can be resumed.
  el("new-puzzle-continue").hidden = editingDraft || !draftStarted();
  el("new-puzzle-continue").textContent = TriCopy.t("editor.newContinue", { name: draft.name });
  el("new-puzzle-replaces").hidden = !draftStarted();
  el("new-puzzle-replaces").textContent = TriCopy.t("editor.newReplaces", { name: draft.name });
  el("app").inert = true;
  if (!newDialog.open) newDialog.showModal();
  call("sync");
  el("new-puzzle-name").focus();
  window.triSyncHistory?.();
};
window.triCloseNewPuzzle = (focus = true) => {
  if (!newDialog.open) return;
  newDialog.close();
  el("app").inert = !!window.triMenuOpen || el("theme-welcome").open;
  call("sync");
  if (focus) newOpener?.focus({ preventScroll: true });
  window.triSyncHistory?.();
};
el("new-puzzle-cancel").onclick = () => window.triCloseNewPuzzle();
newDialog.addEventListener("cancel", event => { event.preventDefault(); window.triCloseNewPuzzle(); });
el("new-puzzle-continue").onclick = () => {
  window.triCloseNewPuzzle(false);
  loadCustom(draft, true, true);
};
el("new-puzzle-form").addEventListener("submit", event => {
  event.preventDefault();
  const size = Number(el("new-puzzle-size").value);
  window.triCloseNewPuzzle(false);
  loadCustom({ name: el("new-puzzle-name").value.trim() || TriCopy.t("editor.my-puzzle"), size, solution: Array(size * size).fill(0) },
    true, true);
});
el("editor-new").onclick = () => window.triOpenNewPuzzle(el("editor-new"));
el("editor-open").onclick = () => {
  toggleMenu(false);
  window.triOpenNewPuzzle(el("menu-toggle"));
};
el("editor-test").onclick = () => {
  if (!state?.custom || !authorSession) return;
  call("editing", state.editing ? 0 : 1);
};
el("editor-name").oninput = () => {
  if (!currentPuzzle) return;
  currentPuzzle.name = el("editor-name").value.trim() || TriCopy.t("editor.my-puzzle");
  el("workshop-title").textContent =
    TriCopy.t(state.editing ? "editor.editingTitle" : "editor.tryingTitle", { name: currentPuzzle.name });
  if (authorSession) {
    draft.name = currentPuzzle.name;
    saveDraft();
  }
};
el("editor-size").onchange = () => {
  const n = Number(el("editor-size").value);
  if (
    currentPuzzle.solution.some(Boolean) &&
    !confirm(TriCopy.t("editor.confirmResize"))
  ) {
    el("editor-size").value = currentPuzzle.size;
    return;
  }
  loadCustom(
    { ...currentPuzzle, size: n, solution: Array(n * n).fill(0) },
    true,
    true,
  );
};
function downloadPuzzle(text, extension, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download =
    (currentPuzzle.name.replace(/[^a-z0-9_-]+/gi, "-") || "tri-puzzle") +
    extension;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el("editor-json").onclick = () =>
  downloadPuzzle(
    JSON.stringify(currentPuzzle, null, 2),
    ".json",
    "application/json",
  );
el("editor-export").onclick = () => {
  const copy = exportTemplate.cloneNode(true);
  const embedded = document.createElement("script");
  embedded.id = "embedded-puzzle";
  embedded.type = "application/json";
  embedded.textContent = JSON.stringify(currentPuzzle).replace(/</g, "\\u003c");
  copy.querySelector("head").append(embedded);
  copy.querySelector("title").textContent =
    TriCopy.t("editor.exportTitle", { name: currentPuzzle.name });
  downloadPuzzle("<!doctype html>\n" + copy.outerHTML, ".html", "text/html");
};
let initializedCustom = false;
window.triInitializeCustom = () => {
  if (initializedCustom) return;
  initializedCustom = true;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has("level")) {
    const index = Number(params.get("level"));
    if (/^\d+$/.test(params.get("level")) && index < state.levels.length) {
      window.triShowPlay(); call("level", index);
    } else { window.triShowHome(); toast(TriCopy.t("editor.invalid-level-link")); }
    return;
  }
  if (params.has("endless")) {
    try {
      const { difficulty, number } = TriShare.parseEndless(params.get("endless"));
      if (!TriShare.endlessPuzzle(difficulty, number)) throw Error();
      // Returning to your own puzzle's address is not a shared arrival.
      const own = !!window.TriEndless.record(TriShare.endlessKey(difficulty, number));
      window.triStartEndless(difficulty, number, !own);
    } catch {
      window.triShowHome?.();
      el("load-error").textContent = TriCopy.t("share.invalid-endless-link");
      el("load-error").hidden = false;
    }
    return;
  }
  if (params.has("seed")) {
    try {
      loadCustom(TriShare.seedPuzzle(params.get("seed")), false, false, null, true);
    } catch {
      window.triShowHome?.();
      el("load-error").textContent =
        TriCopy.t("errors.seedLink");
      el("load-error").hidden = false;
    }
    return;
  }
  if (params.has("daily")) {
    window.triOpenDaily(params.get("daily"), { fromLink: true });
    return;
  }
  const code = params.get("p");
  if (code !== null) {
    try {
      loadCustom(TriShare.decode(code), false, false, null, true);
    } catch {
      window.triShowHome?.();
      el("load-error").textContent =
        TriCopy.t("errors.puzzleLink");
      el("load-error").hidden = false;
    }
    return;
  }
  const embedded = el("embedded-puzzle");
  if (!embedded) {
    window.triShowHome?.();
    return;
  }
  try {
    const puzzle = JSON.parse(embedded.textContent);
    if (!validPuzzle(puzzle)) throw Error(TriCopy.t("editor.invalid-puzzle-data2"));
    loadCustom(puzzle, false, false);
  } catch {
    toast(TriCopy.t("editor.the-embedded-puzzle-is-invalid"));
  }
};

el("editor-share").onclick = async () => {
  if (!currentPuzzle) return;
  const url = TriShare.url(currentPuzzle);
  const output = el("share-output");
  output.value = url;
  output.hidden = false;
  try {
    await navigator.clipboard.writeText(url);
    toast(TriCopy.t("editor.puzzle-link-copied"));
  } catch {
    output.focus();
    output.select();
    toast(TriCopy.t("editor.select-and-copy-the-puzzle-link"));
  }
};
window.addEventListener("hashchange", event => {
  // back.js already restored the view for its own history moves.
  if (window.triConsumeTraversal?.(event.newURL)) return;
  initializedCustom = false;
  window.triInitializeCustom();
});
