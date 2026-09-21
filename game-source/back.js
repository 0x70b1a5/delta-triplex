"use strict";
// Use the top document's history when embedded in our same-origin preview.
// Browser Back and native Back gestures routed to browser history share this path.
let historyHost = window;
try {
  if (window.parent.location.origin === location.origin)
    historyHost = window.parent;
} catch {}
const historyKey = "deltaTriplex";
const historyId =
  historyHost.history.state?.[historyKey]?.id ||
  Math.random().toString(36).slice(2);
let depth = historyHost.history.state?.[historyKey]?.depth || 0;
let pending = false,
  applying = false;
function uiDepth() {
  const playing = !el("home").hidden ? 0 : 1;
  const section = !el("home-back").hidden && !el("home").hidden;
  const dialog = el("load-dialog").open || el("theme-welcome").open || !el("puzzle-menu").hidden || !el("memory-panel").hidden;
  return (playing || section ? 1 : 0) + (dialog ? 1 : 0);
}
function record(value) {
  return {
    ...historyHost.history.state,
    [historyKey]: { id: historyId, depth: value },
  };
}
historyHost.history.replaceState(record(depth), "");
window.triSyncHistory = function () {
  if (pending || applying) return;
  const desired = uiDepth();
  if (desired < depth) {
    pending = true;
    historyHost.history.go(desired - depth);
    return;
  }
  while (depth < desired) {
    depth++;
    historyHost.history.pushState(record(depth), "");
  }
};
function handleHistoryPop(event) {
  const entry = event.state?.[historyKey];
  depth = entry?.id === historyId ? entry.depth : 0;
  if (pending) {
    pending = false;
    window.triSyncHistory();
    return;
  }
  applying = true;
  try {
    if (uiDepth() > depth) {
      window.triClosePuzzleLoader?.();
      window.triCloseThemeWelcome?.();
      if (!el("puzzle-menu").hidden) toggleMenu(false);
      if (!el("memory-panel").hidden) memoryToggle(false);
      if (uiDepth() > depth) window.triShowHome();
    } else if (depth > uiDepth()) {
      // Forward may reopen play/the menu; the active board is retained.
      if (depth >= 1 && uiDepth() === 0) {
        window.triShowPlay();
        call("sync");
      }
      if (depth >= 2) toggleMenu(true);
    }
  } finally {
    applying = false;
  }
}
historyHost.addEventListener("popstate", handleHistoryPop);
window.addEventListener("pagehide", () =>
  historyHost.removeEventListener("popstate", handleHistoryPop),
);
window.addEventListener("pageshow", () => {
  historyHost.removeEventListener("popstate", handleHistoryPop);
  historyHost.addEventListener("popstate", handleHistoryPop);
});
window.triSyncHistory();
