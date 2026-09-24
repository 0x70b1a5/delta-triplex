#!/usr/bin/env bash
# Deploy the daily API on this machine: rebuild dailies.json from the designs,
# install api.mjs under /opt/delta-api, and (re)start delta-api.service.
# Needs system Node 22.13+ at /usr/bin/node (NodeSource apt).
# The database lives in /var/lib/delta and is never touched here.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$here/dailies.py" build
install -d /opt/delta-api
install -m 644 "$here/api.mjs" "$here/dailies.json" /opt/delta-api/
if ! cmp -s "$here/deploy/delta-api.service" /etc/systemd/system/delta-api.service; then
  install -m 644 "$here/deploy/delta-api.service" /etc/systemd/system/delta-api.service
  systemctl daemon-reload
  systemctl enable delta-api.service
fi
systemctl restart delta-api.service
sleep 1
systemctl --no-pager --lines=5 status delta-api.service
curl -fsS http://127.0.0.1:8787/api/dailies | head -c 300; echo
if ! grep -q "reverse_proxy 127.0.0.1:8787" /etc/caddy/Caddyfile; then
  echo "Caddy is not proxying /api yet; see server/README.md." >&2
fi
