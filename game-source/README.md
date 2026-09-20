# Delta Triplex

A rotating triangular nonogram with a shared C rules engine, an SVG board and DOM controls. The standalone HTML embeds its Emscripten WebAssembly engine and has no runtime network dependencies. The Site wrapper serves `public/game.html`.

## Homepage

The homepage is a four-row triangle: the top seven-cell strip is a filled DELTA TRIPLEX banner, the five downward-facing middle cells hold the menu buttons, three upward-facing cells remain unfilled, and the credit tip links to https://lovecrypt.itch.io/. On desktop, half the credit tip extends below the viewport. Mobile keeps the triangle equilateral and centered, allowing slight side bleed.

The title and triangle menus use bundled Michroma in uppercase (SIL Open Font License; see `fonts/OFL-Michroma.txt`). The build embeds the font and its license, preserving standalone/offline deployment. Oxanium and Space Grotesk remain alternative title options.

Level Select and Endless Mode use the same triangular layout, adding complete rows for additional options. Each submenu has a Back button in its bottom tip. Opening a submenu zooms the entire homepage toward the selected cell over 360ms: neighboring cells move offscreen while the full submenu is drawn immediately inside the expanding cell. Both menus stay opaque throughout, with a triangular background behind the submenu covering the old button label. Back reverses that whole-menu camera movement. Both menus are inert during the transition, and resize or reduced-motion changes settle it cleanly.

All triangle menus flash outward from the bottom cell in shared-edge distance waves, advancing every 500ms through upward fillers and downward cells to the banner. Corner contact alone does not advance the wave. Labels retain contrasting colours throughout each pulse.

Appearance offers System (the default), Light, Dark and Colorful, persisted under `delta-triplex-theme`. System follows OS changes; Light uses white backgrounds and black filled cells, and Dark reverses them. Colorful restores random contrasting puzzle palettes and a gently drifting menu palette. Background and filled-cell picks override any theme independently; clear restores that theme's automatic colour, and the dice chooses a contrasting colour. Picks persist across themes and reloads under the original `delta-triplex-rotation-colours` key. The menu's drift respects picks and never changes the gameplay palette.

Palette generation, override composition, contrast and flash mixing live in `palette.js`; the UI owns only preference persistence and applying the resolved palette. System/Light/Dark use ROYGBIV flash stages, including with custom colours. Colorful uses the original white pulses. All modes retain the same shared-edge propagation. Idle rainbow waves continue their colour sequence across loops. Motion pauses while hidden and respects reduced motion. Hovered, pressed and keyboard-focused buttons use the filled-cell colour with contrasting text.

On the first game start (including a shared puzzle link), a native modal offers Light, Dark, System and Colorful with lightweight SVG triangle previews. The current theme is preselected and choices preview immediately through the existing theme controls. Start playing or Escape accepts the choice; `delta-triplex-theme-welcome` prevents repeat prompts. The board and game clock pause while it is open. Browser Back closes the chooser before leaving the game.

## Playing

Tap/click a triangle to cycle empty → filled → crossed → empty. Right-click crosses or clears. Crossed cells have half the background opacity of unmarked cells; their cross glyph remains fully opaque and contrasts with the composited background. Every strip must match its run-length clues; crosses are optional. Two clue sides are visible at a time, with no selected-row highlighting. Read each clue sequence from outside toward the board.

Desktop layouts (900px and wider) center a maximized point-down triangle with a horizontal top base. Mobile layouts point right. Turning reveals the hidden clues in 120° steps. Use the rotation icons, arrow keys, wheel, a swipe (45px desktop / 90px mobile), or a two-finger twist. Mobile swipe preview sensitivity is half desktop sensitivity. A gesture cancels without painting; incomplete gestures ease back without counting a turn. Buttons and cell input pause during animated settling. Scroll events are discarded during a turn and for another 420ms after a scroll-triggered turn finishes, so lingering wheel momentum cannot accumulate a duplicate. Reduced motion uses the same cooldown after its instant turn.

Each ordinary turn eases over about 420ms. The board rotates about its fixed centroid. Both layouts maximize and center the combined triangle and hints across all three resting orientations. The pivot stays fixed, and the board shrinks only as needed during a turn. Fitting is cached until viewport or clue geometry changes. Background and fill hues follow the same angle, including gesture previews and snap-back: each 120° turn shifts hue by 120°, and three turns return to the selected palette. Saved color selections remain the base palette; neutral colors remain neutral. Hint text uses the filled-cell color. Its corner anchors align with lines through the strip's end-cell centers: bottom-right for desktop left clues; bottom-left for desktop right and mobile upper clues; top-left for mobile lower clues. Numbers disappear during turns.

## Completion and effects

The solved notice, Share, Next, Undo, Reset and Menu share one bottom row. Desktop shows the time and rotation count beside Solved; mobile omits the Solved label and names the button Share solution. Solved boards reclaim the clue space: mobile uses equal left/right margins, while desktop uses equal top/bottom screen margins. The triangle keeps its proportions and fits the available space. Next uses an arrow icon. Share retains the full result regardless of viewport size, using the native share sheet, clipboard, or a selectable-text fallback.

Filling a cell triggers the C engine's edge-adjacent ripple, rendered through per-cell light values and rainbow stages in SVG. Taps commit on release to distinguish them from rotation gestures; the effect clock starts at that commit rather than waiting for the next animation frame. Solving triggers the original 500ms 360° cubic-ease-out spin and smoothstep 1 → 1.1 → 1 scale pulse; the board rotates about the same central active cell as the original raylib camera, without edge anchoring or fit constraints. Shared-edge waves then continue flashing every 500ms from the visible point to the base, with one distance shell visibly active until the next takes over. The wave follows the runtime orientation. Victory effects never increment rotations or change the frozen solve result. All animation and flashes respect reduced motion. The old selected-strip idle shine is not used because this design has no selected strip.

The stopwatch counts active puzzle time, pausing in menus and hidden tabs. Built-in progress, elapsed time, rotations and view persist together. Reset begins a new attempt; undo does not erase rotations. Custom imports and editor trials start fresh, matching their empty boards. Saved solved boards without a timing record show a previous-session result instead of inventing a time.

## Puzzles and sharing

New Game resets the stock run. Level Select opens the built-in levels. Endless difficulties Sprout, Easy, Medium, Hard and Impossible use side lengths 3, 4, 6, 8 and 10. Sprout uses ID 4 so existing difficulty IDs and seed links remain compatible. The C generator certifies uniqueness through line-placement deduction and enforces the difficulty's minimum deduction rounds. Next advances a stock run or generates another Endless puzzle; imported puzzle completion returns home, and editor trials return to authoring.

Orientation is runtime state, not puzzle data. JSON uses `format: "tri-logic"`, `version: 2`, `cellOrder: "north-row-major"`, `size`, `name`, and a binary `solution` of length `size²`. Canonical index is `r*r + 2*i + o`, where `r = i+j+o`. Legacy orientation properties are accepted but ignored on import. New JSON and seeded generation omit orientation. Packed links use version 2 with only a version byte, size byte, and MSB-first solution bits. Legacy version-1 packed links still load. Seed links contain seed/difficulty; stock links use a level ID.

The share origin is `https://delta.theologi.ca/`. Playable HTML exports embed the puzzle in the same application and can be re-exported. Editor drafts and built-in attempts are separate; the rotating design uses `tri-rotate-*` progress/draft/timing storage keys and its own theme preference key.

## Source map

- `src/puzzle.c`: strips, run matching, cell state and completion.
- `src/generator.c`: generation and deduction certification.
- `src/main.c`: engine API, saves/undo, effects, canonical-cell snapshots, and legacy raylib geometry.
- `rotate.js`: current SVG renderer, fit/anchor calculations, gestures, timing, completion UI and brag sharing.
- `app.js`, `editor.js`, `flow.js`, `share.js`, `back.js`: browser bridge, palettes, editor/import/export, navigation/generation, link formats and history.
- `shell.html`: document structure and responsive layout.

## Build and checks

Requires Emscripten 4.0.16, raylib 5.5, Python 3, Make and Node. With Emscripten activated and raylib available:

```sh
make -C /path/to/raylib/src PLATFORM=PLATFORM_WEB
make -C game-source web RAYLIB=/path/to/raylib
cp game-source/web/index.html public/game.html
npm --prefix game-source install
npm --prefix game-source test
make -C game-source test test-generator
make -C game-source test-game RAYLIB=/path/to/raylib
```

The tests run real compiled WebAssembly with a DOM harness and stub only graphics initialization. They cover input/undo, mobile swipe sensitivity, animated rotation and viewport fit, clue anchors, all five Endless difficulties, persistence, timing, sharing/export round trips, footer structure/icons, SVG flashes, victory timing and reduced motion. Native tests cover clue rules, geometry, effects, custom/editor history and uniqueness certification. Geometry tests support macOS and GNU linkers.

The legacy native raylib desktop target remains an engine/debug view; the current rotating interface is the browser/SVG application. `test_shared.cjs` forwards to the maintained rotation integration suite.

## Copy and translations

Edit `locales/en.json` for theme-selector text and other game copy. See [the copy guide](locales/README.md) for keys, placeholders, plural forms and locale builds. Rebuild after copy edits; standalone exports include the selected catalog.
