# Delta Triplex source snapshot

Source revision: b5f436246a376865636f6e86079bdb56a1709e48

This archive contains the complete tracked project at that revision, including the latest colour-clear controls and removal of crosses on completion. Git history, installed dependencies, credentials and temporary build caches are not included.

## Where to start

- `game-source/src/main.c`: shared C game engine, rendering, input, animation, saves and WebAssembly API.
- `game-source/src/puzzle.c` and `puzzle.h`: triangular board and clue rules.
- `game-source/src/generator.c` and `generator.h`: seeded Endless generation and uniqueness certification by deduction.
- `game-source/app.js`: shared browser interface and colour preferences.
- `game-source/editor.js`: puzzle editor, imports and exports.
- `game-source/flow.js`: main menu and Endless progression.
- `game-source/share.js`: seed links and packed custom-puzzle links.
- `game-source/back.js`: browser Back handling.
- `game-source/shell.html`: layout and styling.
- `app/`: TypeScript/React Site wrapper.
- `public/game.html`: current playable standalone build with embedded WebAssembly.
- `game-source/README.md`: design decisions, formats, controls and detailed build notes.

The game and editor deliberately share one C renderer and one DOM clue matrix. Most game code is C and JavaScript; the outer Site wrapper is TypeScript.

## Play without rebuilding

Open `public/game.html` in a browser with WebGL, or serve the public directory:

```sh
python3 -m http.server 8000 --directory public
```

Then open `http://localhost:8000/game.html`. This does not require the React wrapper or npm dependencies.

## Rebuild the game

Requires Python 3, Make, Emscripten 4.0.16 and raylib 5.5. Toolchains and raylib source are not bundled. Activate Emscripten and place raylib under `game-source/vendor/raylib`, then run from the archive root:

```sh
make -C game-source/vendor/raylib/src PLATFORM=PLATFORM_WEB
make -C game-source web RAYLIB=vendor/raylib
cp game-source/web/index.html public/game.html
```

`build_shell.py` embeds the JavaScript files and styles; Emscripten embeds the WebAssembly engine.

## Checks

```sh
make -C game-source test-generator
make -C game-source test-game RAYLIB=vendor/raylib
npm --prefix game-source install
npm --prefix game-source test
```

The native geometry target requires Linux/GNU linker tooling. DOM tests exercise the actual compiled WebAssembly but stub graphics rendering; real WebGL/mobile visual verification remains separate.

## Site wrapper

Root `package.json`, `pnpm-lock.yaml`, `scripts/` and the Site configuration are included unchanged. The wrapper requires the Node/pnpm versions declared in `package.json`. The existing `.openai/hosting.json` identifies the current private preview; it contains no authentication credentials.

The public share origin is intentionally still `https://delta-triplex.example/` in `game-source/share.js`. Replace it when assigning a public address. Seed links are not guaranteed to remain stable after generator changes.
