# Release materials

Everything here is made from the real game: the videos are recorded play, and the store art and
share image use real screenshots. Nothing is a redrawing of the board.

| File | What | Where it goes |
|---|---|---|
| `delta-triplex-trailer.mp4` | 1920x1080 play: home, Past Puzzles, a daily solved (with a turn), Submit, end card | itch.io / Newgrounds page video, social posts |
| `delta-triplex-phone.mp4` | 828x1472 (9:16) play on a phone, Light theme, opened from a shared link | Shorts, Reels, TikTok, stories |
| `delta-triplex-play.gif` | 800x450 loop of the trailer's solve | itch.io description, README, forums |
| `cover-itch-630x500@2x.png` | itch.io cover (315:250) | itch.io: Edit game, Cover image |
| `card-720x405@2x.png` | 16:9 card | Newgrounds icon/card, anywhere 16:9 |
| `og-1200x630.png` | link preview image | served as `/og.png` by the site (`og:image`) |
| `endcard-*.png` | the videos' last card | made by `render-art.cjs` for `encode.sh` |
| `shots/` | clean screenshots: home (dark and light), a board mid-solve, the solved picture, phone (Colorful theme) | store screenshots, press |

None of these files are in git (`.gitignore` keeps them out): they are rendered from the game by
the scripts below, which write them into this folder.

## Remaking them

The game must be built (`./build.sh`) so `public/game.html` is current. Recording **submits real
solves** to whatever API the page talks to, so always record against a local server with a copy of
the database, never the live site:

```bash
cp /var/lib/delta/delta.sqlite /tmp/delta-copy.sqlite
PORT=8798 DELTA_DB=/tmp/delta-copy.sqlite node server/api.mjs --static public &   # note the pid; stop it by pid
node marketing/capture.cjs marketing/shots           # stills
node marketing/render-art.cjs                        # cover, card, og image, end cards
node marketing/record.cjs desktop /tmp/frames-desk   # ~10 min on this box
node marketing/record.cjs phone /tmp/frames-phone
marketing/encode.sh /tmp/frames-desk marketing/endcard-1920x1080.png marketing/delta-triplex-trailer.mp4
marketing/encode.sh /tmp/frames-phone marketing/endcard-828x1472.png marketing/delta-triplex-phone.mp4
```

The GIF is cut from the desktop frames; the exact command is in `gif.sh`.

How the recorder works: `vclock.js` replaces the page's clock, timers and animation frames, so
time advances only when the recorder steps it, one 1/30 s frame at a time. Animations come out
smooth even on a slow machine. The moves are not scripted cell by cell: a small line solver reads
the clues on screen, plays the line it can deduce the most from (crossing empty lines first),
and turns the board when the visible clues run dry. The cursor and click rings are an overlay
drawn by the recorder. Scenarios (puzzle, theme, size) are at the top of `record.cjs`.

Needs Playwright (set `PLAYWRIGHT` to its module path) and a Chrome with WebGL
(`CHROME`, default `/usr/bin/google-chrome`; swiftshader works), plus ffmpeg.
