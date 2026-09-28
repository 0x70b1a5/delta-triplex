# Delta Triplex

A triangular nonogram with an SVG interface and a C/WebAssembly puzzle engine.

## Build and deploy

```sh
./build.sh
```

Deploy the **contents of `dist/static/`** to any static web host. Its `index.html` contains the game, scripts, styles and WebAssembly; no Node server or runtime downloads are needed. The build also refreshes `public/game.html` for the optional React Site wrapper.

Install Python 3, Make, Git and a C/C++ toolchain first (Xcode Command Line Tools on macOS, or build-essential on Debian/Ubuntu). On first use the script downloads Emscripten 4.0.16 and raylib 5.5 into the ignored `.build/` directory. Later builds reuse those tools. Internet access is needed for the initial setup.

If you already have the tools, activate Emscripten before running the script, or supply their locations:

```sh
DELTA_EMSDK=/path/to/emsdk RAYLIB=/path/to/raylib ./build.sh
```

The script rebuilds the supplied raylib directory for the web. Run `./build.sh --help` for options. Preview the deployment locally:

```sh
python3 -m http.server 8000 --directory dist/static
```

Open `http://localhost:8000`. The share URL is `https://deltatriplex.com/`, configured in `game-source/share.js`. Rebuild after changing it. Use HTTPS in production for clipboard and native sharing support where available.

Source, controls and test instructions are documented in [game-source/README.md](game-source/README.md). The React wrapper remains available through the existing Sites build/publish workflow, but is not required for static hosting.
