"use strict";
// One-time onboarding reuses the same theme controls and palette calculations.
(() => {
  const dialog = el("theme-welcome"), choices = [...dialog.querySelectorAll('input[name="welcome-theme"]')];
  let seen = false;
  try { seen = localStorage.getItem("delta-triplex-theme-welcome") === "1"; } catch {}
  function preview(mode) {
    const colorfulBase = { bg: '#17212b', cell: '#a6edcf' };
    function board(theme, x, side) {
      let shapes = `<rect x="${x}" width="${mode === 'system' ? 100 : 200}" height="110" fill="${theme.bg}"/>`;
      const left = x + (mode === 'system' ? 100 : 200) / 2 - side / 2, top = (110 - side * Math.sqrt(3) / 2) / 2;
      const w = side / 3, h = w * Math.sqrt(3) / 2;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3 - row; col++) {
        const px = left + row * w / 2 + col * w, py = top + row * h;
        shapes += `<polygon points="${px+1},${py+1} ${px+w-1},${py+1} ${px+w/2},${py+h-1}" fill="${(row + col) % 2 ? theme.empty : theme.cell}"/>`;
        if (col < 2-row) shapes += `<polygon points="${px+w/2+1},${py+h-1} ${px+w},${py+1} ${px+1.5*w-1},${py+h-1}" fill="${theme.empty}"/>`;
      }
      return shapes;
    }
    const content = mode === 'system'
      ? board(TriPalette.theme('light', chosenColours), 0, 84) + board(TriPalette.theme('dark', chosenColours), 100, 84)
      : board(TriPalette.theme(mode, chosenColours, colorfulBase), 0, 112);
    return `<svg viewBox="0 0 200 110" aria-hidden="true" focusable="false">${content}</svg>`;
  }
  function choose(mode) {
    el("theme-mode").value = mode;
    el("theme-mode").dispatchEvent(new Event("change"));
  }
  function finish() {
    if (!dialog.open) return;
    seen = true;
    try { localStorage.setItem("delta-triplex-theme-welcome", "1"); } catch {}
    choose(choices.find(input => input.checked)?.value || themeMode);
    dialog.close();
    el("app").inert = !!window.triMenuOpen;
    call("sync");
    if (!window.triMenuOpen) el("rotate-board")?.focus({ preventScroll: true });
    window.triSyncHistory?.();
  }
  for (const input of choices) input.addEventListener("change", () => choose(input.value));
  dialog.querySelector("form").addEventListener("submit", event => { event.preventDefault(); finish(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(); });
  window.triCloseThemeWelcome = finish;
  window.triMaybeChooseTheme = () => {
    if (seen || dialog.open) return;
    for (const input of choices) {
      input.checked = input.value === themeMode;
      input.closest('label').querySelector('.theme-preview').innerHTML = preview(input.value);
    }
    el("app").inert = true;
    dialog.showModal();
    choices.find(input => input.checked)?.focus();
  };
})();
