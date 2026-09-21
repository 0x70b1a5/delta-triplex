"use strict";
// Display-only daily archive. No date is mapped to a generated puzzle yet.
(() => {
  const picker = el("calendar-month"), grid = el("calendar-grid");
  const firstMonth = "2026-09";
  let selected = "";
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
    const rows = Math.ceil((Math.sqrt(8 * days + 1) - 1) / 2);
    const today = dateKey(new Date());
    grid.style.setProperty("--rows", rows);
    grid.dataset.rows = rows;
    grid.replaceChildren();
    let day = 1;
    // The point is day 1. Read each successive row left-to-right toward the wide edge.
    for (let row = 0; row < rows; row++) for (let col = 0; col <= row; col++) {
      const x = (rows - row - 1) / 2 + col, y = rows - row - 1;
      function position(cell, x, up = false) {
        cell.className = "calendar-cell" + (up ? " calendar-up" : "");
        cell.style.setProperty("--x", x / rows * 100 + "%");
        cell.style.setProperty("--y", y / rows * 100 + "%");
        grid.append(cell);
      }
      if (day <= days) {
        const date = new Date(year, number - 1, day, 12);
        const key = dateKey(date), button = document.createElement("button");
        position(button, x);
        button.dataset.date = key;
        button.dataset.day = day;
        const label = document.createElement("span"); label.textContent = day;
        button.append(label);
        button.disabled = key > today;
        button.setAttribute("aria-label", TriCopy.t(button.disabled ? "calendar.future" : "calendar.day", { date: dateLabel(date) }));
        button.setAttribute("aria-pressed", String(key === selected));
        if (key === today) button.setAttribute("aria-current", "date");
        button.onclick = () => select(date);
      } else {
        const unused = document.createElement("i");
        position(unused, x); unused.classList.add("calendar-unused"); unused.setAttribute("aria-hidden", "true");
      }
      if (col < row) {
        const filler = document.createElement("i"); position(filler, x + .5, true); filler.setAttribute("aria-hidden", "true");
      }
      day++;
    }
    if (!selected.startsWith(month + "-")) selected = "";
    el("calendar-status").textContent = selected
      ? TriCopy.t("calendar.selection", { date: dateLabel(new Date(year, number - 1, Number(selected.slice(-2)), 12)) })
      : TriCopy.t("calendar.unassigned");
  }
  picker.addEventListener("change", render);
  window.triOpenCalendar = (today = false) => {
    if (today) { selected = dateKey(new Date()); picker.value = selected.slice(0, 7); }
    if (!picker.value) picker.value = latestMonth();
    render();
    window.triShowHome("calendar");
    (today ? grid.querySelector('[aria-current="date"]') : picker)?.focus({ preventScroll: true });
  };
  picker.value = latestMonth();
  render();
})();
