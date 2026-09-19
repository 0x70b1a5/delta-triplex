#!/usr/bin/env bash
# Build a standalone deployment from source. No Node server is required.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  if [[ $# -eq 1 && ( "$1" == '--help' || "$1" == '-h' ) ]]; then
    cat <<'HELP'
Usage: ./build.sh

Builds dist/static/index.html for any static web host and refreshes public/game.html.
Requires Python 3, Make, Git, and a C/C++ build toolchain.
On first use, downloads Emscripten 4.0.16 and raylib 5.5 into .build/.
Subsequent builds reuse these tools. An active emcc on PATH is used as-is.

Optional environment variables:
  DELTA_EMSDK  Existing emsdk directory (otherwise EMSDK or .build/emsdk-4.0.16)
  RAYLIB       Existing raylib 5.5 directory (otherwise .build/raylib-5.5)

Deploy the contents of dist/static/. Share links use https://delta.theologi.ca/.
HELP
    exit 0
  fi
  echo 'Unknown arguments. Use ./build.sh --help.' >&2
  exit 2
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"
for dependency in python3 make; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Missing required tool: $dependency" >&2
    exit 1
  fi
done

# Keep dependencies out of the deploy directory and source control.
mkdir -p "$project_dir/.build"
sdk_dir="${DELTA_EMSDK:-${EMSDK:-$project_dir/.build/emsdk-4.0.16}}"
raylib_dir="${RAYLIB:-$project_dir/.build/raylib-5.5}"

clone_dependency() {
  local repository="$1" revision="$2" destination="$3"
  if [[ -e "$destination" ]]; then
    echo "Incomplete dependency at $destination; supply a valid tool directory (see --help)." >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    echo 'Git is required to download build dependencies.' >&2
    exit 1
  fi
  git clone --depth 1 --branch "$revision" "$repository" "$destination"
}

if ! command -v emcc >/dev/null 2>&1; then
  if [[ ! -f "$sdk_dir/emsdk_env.sh" ]]; then
    clone_dependency https://github.com/emscripten-core/emsdk.git 4.0.16 "$sdk_dir"
  fi
  if [[ ! -x "$sdk_dir/upstream/emscripten/emcc" ]]; then
    "$sdk_dir/emsdk" install 4.0.16
    "$sdk_dir/emsdk" activate 4.0.16
  fi
  # The SDK's environment script can reference unset shell variables.
  set +u
  source "$sdk_dir/emsdk_env.sh"
  set -u
fi
command -v emcc >/dev/null 2>&1 || { echo 'Emscripten activation failed.' >&2; exit 1; }

if [[ ! -f "$raylib_dir/src/raylib.h" ]]; then
  clone_dependency https://github.com/raysan5/raylib.git 5.5 "$raylib_dir"
fi
raylib_dir="$(cd "$raylib_dir" && pwd)"
# Force recompilation so supplied native object files cannot enter the web build.
make -B -C "$raylib_dir/src" PLATFORM=PLATFORM_WEB RAYLIB_LIBTYPE=STATIC
make -C "$project_dir/game-source" web RAYLIB="$raylib_dir"

mkdir -p "$project_dir/dist/static"
cp "$project_dir/game-source/web/index.html" "$project_dir/dist/static/index.html"
cp "$project_dir/game-source/web/index.html" "$project_dir/public/game.html"
printf '\nBuild complete. Deploy the contents of:\n  %s/dist/static/\n' "$project_dir"
printf 'Local preview: python3 -m http.server 8000 --directory "%s/dist/static"\n' "$project_dir"
