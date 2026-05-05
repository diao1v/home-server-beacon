#!/usr/bin/env bash
# Run ON an agent host (after `git clone`) to bootstrap the agent.
#
# Usage:
#   ~/homelab/scripts/setup-agent.sh <server-id> [display-name] [bind-host]
#
# What it does:
#   1. Auto-detects this host's LAN IP (override with the optional 3rd arg)
#   2. Generates a fresh API key
#   3. Writes packages/agent/docker-compose.yml from the template with
#      SERVER_ID / API_KEY / BIND_HOST patched in
#   4. `docker compose up -d --build`
#   5. Prints a servers.yaml snippet for the monitor

set -euo pipefail

ID="${1:-}"
NAME="${2:-${ID:-}}"
BIND_OVERRIDE="${3:-}"

if [[ -z $ID ]]; then
  echo "Usage: $0 <server-id> [display-name] [bind-host]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/packages/agent"

# Prereqs
command -v docker >/dev/null 2>&1 || { echo "docker not installed" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "'docker compose' plugin missing" >&2; exit 1; }

# Refuse to clobber an existing config — re-running would change the API key
# and silently break the matching entry on the monitor.
if [[ -f $COMPOSE_DIR/docker-compose.yml ]]; then
  echo "error: $COMPOSE_DIR/docker-compose.yml already exists." >&2
  echo "       Delete it first if you want to re-bootstrap, or edit by hand." >&2
  exit 1
fi

# Resolve BIND_HOST — explicit override wins, else first RFC1918 IP on a real interface.
BIND_HOST="$BIND_OVERRIDE"
if [[ -z $BIND_HOST ]]; then
  BIND_HOST=$(ip -4 -br addr show \
    | awk '$1 !~ /^(lo|docker|br-|veth|tailscale|tun)/ && $3 ~ /^(192\.168|10\.|172\.)/ {split($3, a, "/"); print a[1]; exit}')
fi
if [[ -z $BIND_HOST ]]; then
  echo "error: could not auto-detect LAN IP — pass it as the 3rd argument" >&2
  exit 1
fi
echo "  LAN IP: $BIND_HOST"

KEY=$(openssl rand -hex 24)

cd "$COMPOSE_DIR"
cp docker-compose.example.yml docker-compose.yml

sed -i \
  -e "s|SERVER_ID:.*|SERVER_ID: $ID|" \
  -e "s|API_KEY:.*|API_KEY: $KEY|" \
  -e "s|BIND_HOST:.*|BIND_HOST: $BIND_HOST|" \
  docker-compose.yml

docker compose up -d --build

cat <<EOF

✓ Agent up. id=$ID at http://$BIND_HOST:3005

Add to the monitor's servers.yaml:

  - id: $ID
    displayName: '$NAME'
    url: http://$BIND_HOST:3005
    apiKey: $KEY

Then on the monitor host:
  cd ~/homelab && git pull && cd packages/monitor && docker compose restart
EOF
