# Daily puzzles and stats

The game stays a static file. This directory adds a small API (`api.mjs`, Node 22.13+, no dependencies, SQLite via `node:sqlite`) that releases one curated puzzle per date and ranks each player's first solve.

## Players

There are no accounts. The first time someone plays a daily, their browser makes a random 25-character code and keeps it in `localStorage` (`tri-daily-v1`). Every solve is sent with that code. The database stores only its SHA-256. Settings → Daily stats sync shows the code; typing it on another device makes that device the same player. Dailies solved only on the new device are then added to the code.

## Dailies

Designs live in `dailies/*.txt` as ASCII triangles. `dailies.py` documents the format, checks that every design solves by line logic alone (so it has one solution and never needs a guess) and renders previews to `preview/`.

```sh
python3 server/dailies.py check      # verify all designs, write preview PNGs
python3 server/dailies.py build      # write server/dailies.json
python3 server/dailies.py show CODE  # print a packed puzzle code as ASCII
```

The API loads `dailies.json` at startup. A date is released once it is today anywhere on Earth (UTC+14), so future puzzles are never served early. `dailies.json` is the schedule: dates can be redrawn, moved or dropped freely until someone solves them. After the first solve a date's puzzle is frozen (the API keeps it and logs a warning), and only its name may change.

## API

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/dailies` | | released `{date, name}` list |
| `GET /api/daily/YYYY-MM-DD` | | `{date, name, code}` or 404 |
| `POST /api/solve` | `{secret, date, elapsedMs, turns, filled}` | stats; `filled` must equal the solution; only the first solve counts |
| `POST /api/stats` | `{date, secret?}` | stats, with `you` when that player solved it |
| `POST /api/me` | `{secret}` | that player's solves, for sync |

Stats: solver count, time median and log-scale histogram, rotation par (median) and histogram, and for the player their "top X%" (the share of solvers at least as good, rounded up).

## Run and test

```sh
node server/api.mjs --static public        # API + game on http://127.0.0.1:8787
node --test server/test_api.mjs            # API tests
npm --prefix game-source test              # includes test_daily.cjs: game + API end to end
```

## Deploy (this VPS)

```sh
sudo server/deploy/deploy.sh               # build dailies.json, install /opt/delta-api, restart delta-api.service
cp dist/static/index.html /srv/delta/index.html
```

The service uses the system Node (`/usr/bin/node`, NodeSource apt, 22.13 or newer), runs as a throwaway systemd user and keeps its database in `/var/lib/delta/delta.sqlite`. Caddy proxies `/api/*` to it:

```
delta.theologi.ca {
    encode zstd gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        root * /srv/delta
        file_server
    }
}
```

Back up by copying the database with `sqlite3 /var/lib/delta/delta.sqlite ".backup delta-backup.sqlite"`.
