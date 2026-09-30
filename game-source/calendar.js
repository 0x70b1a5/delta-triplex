"use strict";
// Daily archive. daily.js knows which dates have puzzles and opens them.
(() => {
  const scene = el("home-calendar"), picker = el("calendar-month"), grid = el("calendar-grid");
  // Seven rows fit 35 day cells, enough for any month.
  const ROWS = 7;
  scene.dataset.rows = ROWS;
  scene.style.setProperty("--rows", ROWS);
  scene.style.setProperty("--tip", 50 / ROWS + "%");
  Object.assign(scene.querySelector(".home-banner").dataset, { row: 0, wave: 2 * ROWS - 3 });
  const firstMonth = "2026-09";
  let selected = "", focusToday = false;
  const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const dateKey = date => `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
  const latestMonth = () => [firstMonth, monthKey(new Date())].sort().at(-1);
  const dateLabel = date => new Intl.DateTimeFormat(TriCopy.locale, { dateStyle: "long" }).format(date);
  function select(date) {
    selected = dateKey(date);
    for (const cell of grid.querySelectorAll("button")) cell.setAttribute("aria-pressed", String(cell.dataset.date === selected));
    el("calendar-status").textContent = TriCopy.t("calendar.selection", { date: dateLabel(date) });
  }
  function render() {
    picker.max = latestMonth();
    const month = picker.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < firstMonth || month > picker.max) {
      picker.value = selected ? selected.slice(0, 7) : picker.max;
      el("calendar-status").textContent = TriCopy.t("calendar.invalidMonth");
      return;
    }
    const [year, number] = month.split("-").map(Number);
    const days = new Date(year, number, 0).getDate();
    const today = dateKey(new Date());
    grid.replaceChildren();
    let day = 1;
    // Same geometry as the other submenus: banner on row 0, Back in the tip.
    // Rows 1..5 hold 11+9+7+5+3 = 35 alternating down/up cells, read
    // left-to-right from the top-left corner.
    for (let row = 1; row < ROWS - 1; row++) for (let col = 0; col < 2 * (ROWS - row) - 1; col++, day++) {
      const up = col % 2 === 1, x = (row + col) / 2 / ROWS;
      let cell;
      if (day <= days) {
        const date = new Date(year, number - 1, day, 12), key = dateKey(date);
        cell = document.createElement("button");
        cell.dataset.date = key;
        cell.dataset.day = day;
        const label = document.createElement("span"); label.textContent = day;
        cell.append(label);
        cell.disabled = key > today;
        const daily = cell.disabled ? null : window.triDailyStatus?.(key);
        if (daily) cell.dataset.daily = daily.solved ? "solved" : daily.started ? "started" : "open";
        else if (!cell.disabled && window.triDailyListLoaded?.()) cell.dataset.daily = "none";
        cell.setAttribute("aria-label", cell.disabled ? TriCopy.t("calendar.future", { date: dateLabel(date) })
          : daily ? TriCopy.t(daily.solved ? "calendar.solvedDay" : "calendar.puzzleDay", { date: dateLabel(date), name: daily.name })
          : TriCopy.t("calendar.day", { date: dateLabel(date) }));
        if (daily) cell.title = daily.name;
        cell.setAttribute("aria-pressed", String(key === selected));
        if (key === today) cell.setAttribute("aria-current", "date");
        cell.onclick = () => daily ? window.triOpenDaily(key) : select(date);
      } else {
        cell = document.createElement("i");
        cell.setAttribute("aria-hidden", "true");
      }
      cell.className = "home-cell " + (day <= days ? "calendar-day" : "home-filler calendar-unused") + (up ? " home-up" : "");
      cell.style.setProperty("--x", x * 100 + "%");
      cell.style.setProperty("--y", row / ROWS * 100 + "%");
      cell.dataset.row = row;
      cell.dataset.wave = 2 * (ROWS - 1 - row) - (up ? 1 : 0);
      grid.append(cell);
    }
    if (!selected.startsWith(month + "-")) selected = "";
    el("calendar-status").textContent = selected
      ? TriCopy.t("calendar.selection", { date: dateLabel(new Date(year, number - 1, Number(selected.slice(-2)), 12)) })
      : TriCopy.t(grid.querySelector("[data-daily]") ? "calendar.pick" : window.triOnlineOff?.() ? "online.off" : "calendar.unassigned");
  }
  window.triCalendarRefresh = () => { if (!el("home-calendar").hidden) render(); };
  picker.addEventListener("change", render);
  // The zoom transition starts from whichever home cell opened the calendar,
  // and focuses today's date or the month picker once it settles.
  window.triCalendarFocus = () => (focusToday && grid.querySelector('[aria-current="date"]')) || picker;
  window.triOpenCalendar = (today = false) => {
    focusToday = today;
    window.triCalendarSource = today ? "today-puzzle" : "past-puzzles";
    if (today) { selected = dateKey(new Date()); picker.value = selected.slice(0, 7); }
    if (!picker.value) picker.value = latestMonth();
    render();
    window.triShowHome("calendar");
    window.triCalendarFocus().focus({ preventScroll: true });
  };
  picker.value = latestMonth();
  render();
})();
