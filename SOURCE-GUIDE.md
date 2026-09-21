# Delta Triplex source guide

The rotating nonogram design is now the main application. See [game-source/README.md](game-source/README.md) for controls, puzzle formats, effects, build instructions and test coverage.

## Main files

- `game-source/locales/en.json`: central English copy catalog; see `game-source/locales/README.md` for editing and translations.
- `game-source/copy.js`: named interpolation, plural rules and safe HTML insertion.

- `game-source/tutorial-intro.js`: four visual onboarding screens, shared five-row example, clue halos, deduction steps and rotation preview. Copy lives under `intro.*` in the locale catalog.
- `game-source/calendar.js`: display-only daily archive, triangular date layout and month/year selection.
- `game-source/menu-background.js`: three crisp overlapping triangular lattice fields behind all menus, driven by the shared menu animation clock.
- `game-source/home.js`: triangle menu layout, submenu zoom transitions, row flashes, isolated hue animation and reduced-motion handling.
- `game-source/rotate.js`: SVG board, responsive clue placement, rotation gestures, timing and result sharing.
- `game-source/src/main.c`: C engine API, canonical cell snapshots, undo/saves, ripples, solved-row flashes and victory animation timing.
- `game-source/src/puzzle.c` and `puzzle.h`: triangular board and run-length rules.
- `game-source/src/generator.c` and `generator.h`: Endless generation and uniqueness certification by deduction.
- `game-source/app.js`: browser bridge and color preferences.
- `game-source/editor.js`: editor, imports and standalone exports.
- `game-source/flow.js`: menus, progression, generation and completion.
- `game-source/share.js`: versioned packed-puzzle and seed links.
- `game-source/back.js`: browser Back handling.
- `game-source/shell.html`: responsive document and shared footer layout.
- `game-source/build_shell.py`: embeds JavaScript into the build shell.
- `public/game.html`: current standalone application with embedded WebAssembly.
- `app/`: React Site wrapper.

## Play and build

Open `public/game.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/public/game.html`. No runtime downloads are required.

Run `./build.sh` to rebuild from source and produce `dist/static/index.html` for static deployment. It installs missing Emscripten/raylib tools locally and refreshes `public/game.html`. See [README.md](README.md) for prerequisites and tool overrides.

Run `npm --prefix game-source test` after installing its dev dependency. Native checks are `make -C game-source test test-generator` and `make -C game-source test-game RAYLIB=/path/to/raylib` (macOS or GNU linker).

The share origin is `https://delta.theologi.ca/`. Orientation is runtime view state and is omitted from new puzzle specs and seed links.

## Local comparison archive

The prior main source and playable HTML were preserved under `work/pre-rotation-main/` before promotion. `work/rotating-nonogram/compare.html` compares that archive with the current design. These are local ignored artifacts, not dependencies of the main application.
