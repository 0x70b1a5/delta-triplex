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
function toggleMenu(open) {
  menu.hidden = !open;
  el("menu-toggle").setAttribute("aria-expanded", String(open));
  (open ? el("menu-close") : el("menu-toggle")).focus();
  window.triSyncHistory?.();
}
el("menu-toggle").onclick = () => toggleMenu(menu.hidden);
el("menu-close").onclick = () => toggleMenu(false);
el("replay").onclick = () => {
  window.triShowPlay?.();
  call("replay");
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

const directionCodes = ["S", "E", "N", "W"];
function validPuzzle(value) {
  return (
    value &&
    Number.isInteger(value.size) &&
    value.size >= 2 &&
    value.size <= 10 &&
    Array.isArray(value.solution) &&
    value.solution.length === value.size ** 2 &&
    value.solution.every((v) => v === 0 || v === 1) &&
    (!value.orientation || directionCodes.includes(value.orientation))
  );
}
function normalizePuzzle(value) {
  return {
    format: "tri-logic",
    version: 2,
    cellOrder: "north-row-major",
    name: String(value.name || TriCopy.t("editor.my-puzzle")).slice(0, 80),
    size: value.size,
    solution: value.solution.slice(),
    ...(Number.isInteger(value.seed) &&
    value.seed >= 0 &&
    value.seed <= 0xffffffff &&
    Number.isInteger(value.difficulty) &&
    value.difficulty >= 0 &&
    value.difficulty <= 4
      ? { seed: value.seed, difficulty: value.difficulty }
      : {}),
  };
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
  authorSession = false;

const settings = document.createElement("section");
settings.id = "editor-settings";
settings.hidden = true;
settings.innerHTML = `<h3>${TriCopy.html("editor.puzzle-settings")}</h3><label>${TriCopy.html("editor.name")} <input id="editor-name" maxlength="80"></label><label>${TriCopy.html("editor.size")} <select id="editor-size">${Array.from({ length: 9 }, (_, i) => `<option>${i + 2}</option>`).join("")}</select></label><p class="editor-note">${TriCopy.html("editor.settingsHelp")}</p><div class="menu-actions"><button id="editor-export">${TriCopy.html("editor.export-playable-html")}</button><button id="editor-json">${TriCopy.html("editor.export-puzzle-json")}</button><button id="editor-share">${TriCopy.html("editor.copy-puzzle-link")}</button></div><input id="share-output" aria-label="${TriCopy.html("editor.puzzle-link")}" readonly hidden>`;
menu.insertBefore(settings, el("menu-tools").previousElementSibling);
const workshop = document.createElement("section");
workshop.id = "workshop";
workshop.hidden = true;
workshop.innerHTML = `<div id="workshop-title"></div><p id="workshop-help"></p><div class="lesson-actions" id="workshop-actions"><button id="editor-test">${TriCopy.html("editor.try")}</button><button id="editor-configure" title="${TriCopy.html("editor.settings-export")}">${TriCopy.html("editor.settings")}</button><button id="editor-close">${TriCopy.html("editor.done")}</button></div>`;
el("side").insertBefore(workshop, el("corner"));
el("bottom-controls").prepend(el("workshop-actions"));
menu.append(el("controls-hint"));
function saveDraft() {
  try {
    localStorage.setItem("tri-rotate-editor-v1", JSON.stringify(draft));
  } catch {}
}
function loadCustom(puzzle, editing, ownsDraft, endlessRun = null) {
  if (!appReady) return toast(TriCopy.t("errors.loading"));
  if (!validPuzzle(puzzle)) return toast(TriCopy.t("editor.invalid-puzzle-data"));
  window.triCancelGeneration?.();
  window.triEndlessRun = endlessRun;
  window.triShowPlay?.();
  currentPuzzle = normalizePuzzle(puzzle);
  authorSession = ownsDraft;
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
window.triCustomState = (next) => {
  const active = !!next.custom;
  workshop.hidden = !active;
  el("workshop-actions").hidden = !active;
  settings.hidden = !active;
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
    draft = normalizePuzzle(currentPuzzle);
    saveDraft();
  }
  el("workshop-title").textContent =
    TriCopy.t(next.editing ? "editor.editingTitle" : "editor.tryingTitle", { name: currentPuzzle.name });
  el("workshop-help").textContent = next.editing
    ? TriCopy.t("editor.paintHelp")
    : TriCopy.t("editor.playHelp");
  el("editor-test").textContent = next.editing ? TriCopy.t("editor.try") : TriCopy.t("editor.edit");
  el("editor-name").value = currentPuzzle.name;
  el("editor-size").value = String(next.n);
  el("editor-size").disabled = !next.editing;
  el("reset").title = next.editing
    ? TriCopy.t("editor.clear-solution-r-undo-restores-it")
    : TriCopy.t("ui.reset-r-undo-restores-it");
};
el("editor-open").onclick = () => {
  loadCustom(draft, true, true);
  toggleMenu(false);
};
el("editor-test").onclick = () => {
  if (!state?.custom) return;
  if (!state.editing) authorSession = true;
  call("editing", state.editing ? 0 : 1);
};
el("editor-close").onclick = () => {
  call("leave_custom");
  window.triShowHome?.();
  toggleMenu(false);
};
el("editor-configure").onclick = () => {
  toggleMenu(true);
  settings.scrollIntoView?.({ block: "nearest" });
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
  if (params.has("seed")) {
    try {
      loadCustom(
        TriShare.seedPuzzle(
          params.get("seed"),
          params.get("difficulty"),
          params.get("orientation") || undefined,
        ),
        false,
        false,
      );
    } catch {
      window.triShowHome?.();
      el("load-error").textContent =
        TriCopy.t("errors.seedLink");
      el("load-error").hidden = false;
    }
    return;
  }
  const code = params.get("p");
  if (code !== null) {
    try {
      loadCustom(TriShare.decode(code), false, false);
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
window.addEventListener("hashchange", () => {
  initializedCustom = false;
  window.triInitializeCustom();
});
