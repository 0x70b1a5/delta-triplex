const assert = require('assert');
const { harness, source } = require('./test_rotation_harness.cjs');

// The ♫ button: a random lovecrypt song from lovecrypt.net in Bandcamp's small player.
const songs = [
  { id: 119, name: 'To Be Held', albumId: '1682684549', track: 3 },
  { id: 118, name: 'Wilderness Medicine', trackId: '260344730' },
];
function lovecrypt({ fail = false } = {}) {
  const asked = [];
  const fetch = async url => {
    if (!String(url).startsWith('https://lovecrypt.net/api/random-song')) throw new Error('offline');
    asked.push(String(url));
    if (fail) return { ok: false, status: 500, json: async () => ({}) };
    const song = songs[(asked.length - 1) % songs.length];
    return { ok: true, status: 200, json: async () => song };
  };
  return { fetch, asked };
}

(async () => {
  const net = lovecrypt();
  const h = harness(source, 'https://tri.test/', {}, { fetch: net.fetch });
  const $ = id => h.d.getElementById(id);
  h.startPuzzle();
  const button = $('jukebox'), player = $('jukebox-player'), frame = player.querySelector('iframe');
  assert.equal(button.nextElementSibling, $('undo'), '♫ sits immediately left of Undo');
  assert.equal(button.previousElementSibling, $('turn-controls'));
  assert(!button.hidden && player.hidden);
  assert.equal(button.getAttribute('aria-label'), 'Play a random lovecrypt song');

  // An album opens at the chosen track, in the theme's colours.
  button.click();
  await h.settle(() => !player.hidden);
  assert.equal(net.asked[0], 'https://lovecrypt.net/api/random-song');
  assert.match(frame.src, /^https:\/\/bandcamp\.com\/EmbeddedPlayer\/album=1682684549\/size=small\/bgcol=[0-9a-f]{6}\/linkcol=[0-9a-f]{6}\/t=3\/transparent=true\/$/);
  assert.equal(h.w.triJukebox.musicHeld, true, 'the game music holds while a song plays');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Play another lovecrypt song');

  // ♫ again picks another song, never the one playing; a single opens by its track id.
  button.click();
  await h.settle(() => frame.src.includes('track='));
  assert.equal(net.asked[1], 'https://lovecrypt.net/api/random-song?not=119');
  assert.match(frame.src, /\/track=260344730\/size=small\/.*\/transparent=true\/$/);
  assert(!frame.src.includes('/t='));

  // × stops the song and gives the game its music back.
  $('jukebox-close').click();
  assert(player.hidden && !frame.hasAttribute('src'));
  assert.equal(h.w.triJukebox.musicHeld, false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Play a random lovecrypt song');
  assert.equal(h.d.activeElement, button);

  // The player belongs to the puzzle screen: going home closes it and hides ♫.
  button.click();
  await h.settle(() => !player.hidden);
  h.w.triShowHome();
  assert(player.hidden && button.hidden && !frame.hasAttribute('src'));
  assert.equal(h.w.triJukebox.musicHeld, false);
  h.w.triShowPlay();
  assert(!button.hidden && player.hidden);

  // The editor has no game music to stand in for, so ♫ hides there too.
  h.w.triShowHome();
  h.click('create-puzzle');
  h.newPuzzle({ name: 'Quiet', size: 5 });
  assert(h.state.editing);
  assert(button.hidden, '♫ hides in the editor');
  h.close();

  // A song that can't be fetched leaves a note and no player.
  const down = lovecrypt({ fail: true });
  const f = harness(source, 'https://tri.test/', {}, { fetch: down.fetch });
  f.startPuzzle();
  f.d.getElementById('jukebox').click();
  await f.settle(() => !f.d.getElementById('toast').hidden);
  assert.equal(f.d.getElementById('toast').textContent, "Couldn't reach lovecrypt.net. Try again in a moment.");
  assert(f.d.getElementById('jukebox-player').hidden);
  assert.equal(f.w.triJukebox.musicHeld, false);
  assert(!f.d.getElementById('jukebox').hasAttribute('aria-busy'));
  f.close();

  // With online features off (offered on Newgrounds), ♫ isn't shown at all.
  const g = harness(source, 'https://uploads.ungrounded.net/', { 'delta-triplex-online': 'off' }, { fetch: lovecrypt().fetch });
  g.startPuzzle();
  assert(g.d.getElementById('jukebox').hidden, '♫ hides while online features are off');
  g.close();
  console.log('jukebox tests passed');
})().catch(error => { console.error(error); process.exit(1); });
