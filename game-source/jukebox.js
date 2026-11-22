"use strict";
// The ♫ button, left of Undo: a random lovecrypt song in Bandcamp's small player.
// lovecrypt.net picks the song, every song on the roster equally likely; pressing
// ♫ again picks another and × closes the player. While it is open the game's own
// music holds at silence and sound effects play on. The player belongs to the
// puzzle screen: going home or into the editor closes it, and the button hides
// whenever online features are off.
(() => {
  const API = "https://lovecrypt.net/api/random-song";
  const EMBED = "https://bandcamp.com/EmbeddedPlayer/";
  let current = null, asking = 0;

  const button = document.createElement("button");
  button.id = "jukebox";
  button.type = "button";
  button.className = "icon";
  button.setAttribute("aria-controls", "jukebox-player");
  button.setAttribute("aria-expanded", "false");
  // Two beamed eighth notes, drawn to sit with the other line icons.
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.5 7.5v10.9M19.5 4.6v11.3"/><path d="M8.65 6 20.35 3.08v3.2L8.65 9.2z" fill="currentColor" stroke="none"/><g fill="currentColor" stroke="none"><ellipse cx="6.6" cy="18.4" rx="3.1" ry="2.3" transform="rotate(-22 6.6 18.4)"/><ellipse cx="16.6" cy="15.9" rx="3.1" ry="2.3" transform="rotate(-22 16.6 15.9)"/></g></svg>`;
  el("undo").before(button);

  const player = document.createElement("div");
  player.id = "jukebox-player";
  player.hidden = true;
  player.setAttribute("role", "region");
  player.setAttribute("aria-label", TriCopy.t("jukebox.player"));
  player.innerHTML = `<iframe title="${TriCopy.html("jukebox.player")}" allow="autoplay; encrypted-media"></iframe><button id="jukebox-close" type="button" class="icon" aria-label="${TriCopy.html("jukebox.close")}" title="${TriCopy.html("jukebox.close")}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  el("turn-controls").before(player);
  const frame = player.querySelector("iframe");

  function label() {
    const text = TriCopy.t(player.hidden ? "jukebox.play" : "jukebox.another");
    button.setAttribute("aria-label", text);
    button.title = text;
  }
  label();

  // Bandcamp draws its own text, light or dark from bgcol, so the player takes the theme's colours.
  function hex(name) {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    probe.remove();
    return rgb.slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, "0")).join("");
  }
  function embed(song) {
    const what = song.albumId ? `album=${song.albumId}` : `track=${song.trackId}`;
    const start = song.albumId && song.track > 1 ? `t=${song.track}/` : "";
    return `${EMBED}${what}/size=small/bgcol=${hex("--bg")}/linkcol=${hex("--ink")}/${start}transparent=true/`;
  }

  async function play() {
    const ask = ++asking;
    button.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(API + (current ? `?not=${current.id}` : ""), { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error(response.status);
      const song = await response.json();
      if (ask !== asking || !available()) return;
      current = song;
      frame.src = embed(song);
      player.hidden = false;
      button.setAttribute("aria-expanded", "true");
      label();
      TriMusic.hold(true);
    } catch {
      if (ask === asking) toast(TriCopy.t("jukebox.error"));
    } finally {
      if (ask === asking) button.removeAttribute("aria-busy");
    }
  }

  function close({ focus = false } = {}) {
    asking++;
    button.removeAttribute("aria-busy");
    if (player.hidden) return;
    frame.removeAttribute("src");
    player.hidden = true;
    current = null;
    button.setAttribute("aria-expanded", "false");
    label();
    TriMusic.hold(false);
    if (focus && !button.hidden) button.focus();
  }

  function available() {
    return el("home").hidden && !state?.editing && !window.triOnlineOff?.();
  }
  function sync() {
    button.hidden = !available();
    if (button.hidden) close();
  }

  button.onclick = play;
  el("jukebox-close").onclick = () => close({ focus: true });

  for (const name of ["triShowHome", "triShowPlay", "triRotateState", "triCloseOnlineNotice"]) {
    const base = window[name];
    if (base) window[name] = function (...args) { const result = base.apply(this, args); sync(); return result; };
  }
  document.addEventListener("change", event => { if (event.target.id === "online-switch") sync(); });
  sync();
  window.triJukebox = { play, close, get song() { return current; }, get musicHeld() { return TriMusic.held; } };
})();
