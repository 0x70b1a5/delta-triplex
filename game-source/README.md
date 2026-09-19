# Delta Triplex

Standalone triangular nonogram in C/raylib 5.5 and WebAssembly (Emscripten 4.0.16), with a DOM interface. Open `web/index.html` in a browser with WebGL. No runtime network dependencies. `tri-logic-web.zip` contains the same build and license notices for platform upload.

## Menu and completion

The application opens on a main menu: New Game clears the stock run and starts puzzle one; Level Select opens a grid generated from the engine's stock level list; Endless Mode generates Easy, Medium, Hard and Impossible puzzles; Create Puzzle opens the shared editor; Load Puzzle accepts exported version-2 JSON. Playable HTML exports open their embedded puzzle directly. Existing storage keys and the `tri-logic` interchange identifier remain compatible.

Solved boards hide their clue matrix and strip highlight, and show Next. With motion enabled, whole rows pulse every 500 ms, starting at the point and looping from the base back to the point; each row stays visibly lit until the next takes over. Desktop puzzle information sits at the bottom left, aligned with the controls, and the completion notice shares that bottom row outside the board. Floating strip labels are clamped to the viewport. Next advances through the stock levels, returning home after the last. A solved editor trial returns to authoring; a solved imported puzzle returns home. Undo restores the clues. The 0.5-second celebration rotates the board 360 degrees with cubic ease-out and scales 1 → 1.1 → 1 with smoothstep easing on each half. Both transforms pivot on the centre of the active cell nearest the triangle centroid; ties prefer a centreline cell, then canonical cell order, consistently across orientations. It uses the shared raylib camera, stops at rest and respects reduced motion.

## Endless generation

Easy, Medium, Hard and Impossible use sizes 4, 6, 8 and 10 (16, 36, 64 and 100 cells). The generator samples fresh solutions and uses the existing C line ordering and clue construction. Its independent line-placement deduction pass must solve every cell before a puzzle is accepted, proving uniqueness without a search timeout or ambiguous fallback. Difficulty also requires at least 2, 3, 5 and 7 synchronous deduction rounds respectively; Hard and Impossible reject candidates with more than half the cells immediately forced.

Each attempt runs in isolation from the active board. The UI yields between batches of four attempts, supports cancellation, bounds retries, and excludes the previous 32 solutions in the run. Next creates another puzzle at the same difficulty and advances the run's puzzle number. Runs are temporary; stock saves and the editor draft remain untouched. Endless puzzles use the same play, clue selection, undo/reset, celebration and export paths. JSON and HTML exports open as ordinary custom puzzles.

Run `make test-generator` for exhaustive small-board uniqueness checks and generated-puzzle coverage across all difficulties.

## Shared game and editor

Built-in puzzles, solution editing, **Try puzzle**, and exported HTML all use the same C board, geometry, hit testing, rules, undo, effects, canvas renderer, and DOM clue matrix. `editor.js` only manages puzzle data, mode controls, draft persistence and export. There is no separate SVG board or JavaScript nonogram solver.

Open the bottom-right menu and choose **Level editor**. Paint the solution directly on the ordinary board. Select a clue to highlight its strip and floating arrow hint. Undo and Reset remain the same corner controls. **Try puzzle** clears the attempt and switches the same board into play mode; **Back to editing** restores the solution and its authoring undo history. The selected strip survives both transitions. **Settings / export** opens the menu for name, size, orientation, JSON and playable HTML exports. **Done** returns to the main menu. Entering custom play does not write custom cells into built-in saves.

- In play: click/tap cycles empty → filled → crossed → empty; right-click toggles cross/clear. Drag paints the initial stroke's state. Undo (`Z`) restores a whole stroke; Reset (`R`) is undoable.
- In editing: click/tap or drag toggles solution cells between empty and filled; clues are recalculated by the C rules. Crosses have no role in solution authoring.
- Editor sizes are 2–10 (4–100 cells). All are supported by the same engine.
- South means tip down/base up and is the default. N/E/S/W rotate geometry and clue arrows together. The original built-in puzzles are South.
- Selecting a matrix clue highlights its corresponding strip in every mode. Matching clues describe current runs; matching one clue does not prove all its cells correct.
- There is no uniqueness certification, mask-editing UI. Existing built-in masked puzzles retain their holes and adjacency behavior.

The three tutorial stages are sizes 2/3/4. Four built-in puzzles are sizes 4/5/6/6. All three clue directions are retained: the Prism puzzle needs C to distinguish its solution.

## Puzzle interchange

JSON version 2 includes `format: "tri-logic"`, `version: 2`, `cellOrder: "north-row-major"`, `name`, `size`, `orientation`, `solution`, and derived `clues`. Solution bits use canonical North-view row order, top to bottom and left to right: zero-based row r contains 2*r+1 triangles. A C tile `(i,j,o)` maps to canonical ID `(i+j+o)^2 + 2*i + o`. Changing orientation does not permute solution IDs. The engine always derives clues from the solution.

Displayed columns follow rotational order in the South view: A down-right, B left-to-right, C down-left. This order and the arrows rotate together. North reads A up-left/B left/C up-right; East up-right/up/down-right; West down-left/down/up-left. B ranks begin at the South-view top. Engine and serialized clue axes retain their original order (displayed C, A, B), preserving existing puzzles and saves. Orientation-less earlier drafts display South, preserving their solution IDs.

Playable HTML exports embed the puzzle JSON into a copy of this complete application and start it in custom play. They use the same embedded engine and UI, including selectable clue highlights, effects, undo and settings. They can be re-exported without nested applications or accumulating duplicate controls.

## Persistence and performance

`tri-logic-editor` stores the authoring draft. `tri-logic-v1` and `tri-logic-intro-v1` retain their original 64-cell blocks and lengths (257 and 193 characters). These formats are deliberately independent of the engine's new 100-cell capacity. Custom attempts are temporary; the solution draft is saved. Storage failures are caught. Different origins and local-file previews need not share storage.

New puzzle visits generate OKLCH palettes. Manual background and cell colours are independently persisted in `delta-triplex-colours`; automatic puzzle palettes change only unchosen colours. Each picker has a die that randomizes and preserves that colour while leaving the other untouched. Derived colors and contrast checks remain in `palette.js`.

JavaScript coalesces redraws and starts no continuous frame loop. A selected-strip shine runs for 850 ms every 4.8 seconds. A ripple starts only on the initial cell of a filling stroke; clearing and crossing start none. Ripples use eight fixed slots and shared-edge adjacency; holes block propagation. Existing pulses may finish after subsequent input. Hidden tabs stop effects; reduced motion disables them. Authoring, trial play and exports share these rules.

Memory recording remains opt-in, with 600 bounded samples and CSV export. It excludes browser/JavaScript/GPU memory. Wasm capacity is not resident memory.

## Source and build

- `src/puzzle.c`, `src/puzzle.h`: grid, ordered strips, clue generation and matching.
- `src/main.c`: all board state, custom authoring/play modes, geometry/orientation, rendering, effects, saves and exported APIs.
- `app.js`: the single DOM clue interface, input handling, layout and frame scheduling.
- `editor.js`: draft, settings and shared-engine mode/export controller.
- `palette.js`: procedural color and contrast.
- `shell.html`, `build_shell.py`: HTML/CSS and embedding all three UI scripts.

This revision was rebuilt from C source using raylib 5.5 and Emscripten 4.0.16. It does not require or use the previous binary patch. With that toolchain installed and raylib unpacked:

```sh
make -C vendor/raylib/src PLATFORM=PLATFORM_WEB
make web RAYLIB=vendor/raylib
```

The Makefile exposes the custom-mode APIs through Emscripten KEEPALIVE and exports `ccall` for passing custom puzzle data. `make web` creates `web/index.html`; recreate the platform ZIP from that HTML and the two license files. Do not distribute a stale ZIP after a rebuild. The native `desktop` target remains a developer board preview without the browser clue controls.

## Verification

```sh
make test
make test-game RAYLIB=vendor/raylib
npm install
npm test
```

Native tests cover geometry/hit testing, clue directions/highlights, tutorials, strokes, undo, saves, effects, every custom size/orientation, canonical IDs, editor history across trial play, and legacy-save isolation. JS tests run the actual bundled WebAssembly inside a DOM harness; only graphics rendering is stubbed. They exercise the shared clue buttons, pointer inputs, trial transitions, draft/normal saves and standalone HTML export round trips for all directions, as well as ripple conditions and palettes.

A real Chromium launch was attempted, but the environment rejected its required socket operation. Visual/WebGL/mobile-device verification remains outstanding; the passing DOM/engine checks are not a browser play-through. No claim of itch.io/Newgrounds embedding verification is made.

## Share links

Generated puzzles retain their accepted 32-bit seed and difficulty. Copy puzzle link exports `#seed=<hex>&difficulty=<name>&orientation=<S|E|N|W>`; opening it reruns the generator. Generator changes may change or invalidate old seeds. The public share origin is currently the explicit placeholder `https://delta-triplex.example/` in `share.js`; substitute a public origin at release. The private preview accepts the same URL fragments.

Authored puzzles use `#p=<base64url>` instead: binary version byte 1, side-length byte, orientation byte (S/E/N/W = 0/1/2/3), then MSB-first packed solution bits in north-row-major order. Exact byte length, canonical base64url and zero padding are checked. Codes use at most 22 characters for 100 cells. Names and play progress are excluded. Editing a seeded solution discards its seed metadata. The top-level page forwards the fragment to the shared game. Clipboard failure exposes a selectable link field.

Custom controls, undo/reset and menu share one footer row; instructions live in the menu, and the puzzle caption is compact so portrait layouts give more height to the board.

## Back navigation

Level Select is only on the main menu. Browser history adds one entry for play or a main-menu subview, plus one for an open menu/diagnostics panel. Back closes the panel, then returns to the main menu; from the main menu it leaves normally. Closing panels with their buttons also consumes their history entries. The same-origin iframe uses the top document history so desktop Back and mobile Back gestures dispatched to browser history take the same route. Host-app actions that close a webview without invoking history cannot be intercepted by page JavaScript.

Chosen colours have a sibling × button that removes that colour's saved override and restores automatic colour selection, without changing the other colour. Completing a puzzle clears cross annotations from the board; undoing the winning stroke restores the previous crosses along with the previous fills. Previously saved completed boards are also cleaned when loaded.

Endless orientation is deterministic from the seed: `(seed ^ (seed >> 16)) & 3` selects South, East, North, or West. Seed links without an orientation use the generated direction; explicit orientation overrides remain supported for edited exports.
