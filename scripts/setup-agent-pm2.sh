#!/usr/bin/env bash
# Run ON an agent host (after `git clone`) to bootstrap the agent natively
# under PM2 — no Docker container, runs directly on the host so all the
# usual host-visibility wins apply (lsblk, statfs, /proc/1/mounts).
#
# Usage:
#   ~/homelab/scripts/setup-agent-pm2.sh <server-id> [display-name] [bind-host]
#
# Prereqs (verified at runtime):
#   - Node.js 24+
#   - pnpm 9+ (or 10+)
#   - PM2  (npm install -g pm2; will be installed automatically if missing)
#   - openssl (for API key generation)

set -euo pipefail

ID="${1:-}"
NAME="${2:-${ID:-}}"
BIND_OVERRIDE="${3:-}"

if [[ -z $ID ]]; then
  echo "Usage: $0 <server-id> [display-name] [bind-host]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="$REPO_ROOT/packages/agent"
ENV_FILE="$AGENT_DIR/agent.env"

# ── prereqs ────────────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' not installed. $2" >&2
    exit 1
  }
}

require_cmd node    "Install Node 24+ via nvm or your package manager."
require_cmd pnpm    "Install pnpm: corepack enable && corepack prepare pnpm@latest --activate"
require_cmd openssl "openssl is part of every standard Linux install."

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if (( NODE_MAJOR < 24 )); then
  echo "error: Node $NODE_MAJOR detected; agent requires Node 24+." >&2
  echo "       (nvm install 24 && nvm use 24)" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> PM2 not found, installing globally with npm..."
  npm install -g pm2
fi

# Refuse to clobber — re-running would rotate the API key and silently break
# the matching entry on the monitor.
if [[ -f $ENV_FILE ]]; then
  echo "error: $ENV_FILE already exists." >&2
  echo "       Delete it first if you want to re-bootstrap, or edit by hand." >&2
  exit 1
fi

# ── resolve BIND_HOST ──────────────────────────────────────────────────────
BIND_HOST="$BIND_OVERRIDE"
if [[ -z $BIND_HOST ]]; then
  BIND_HOST=$(ip -4 -br addr show \
    | awk '$1 !~ /^(lo|docker|br-|veth|tailscale|tun)/ && $3 ~ /^(192\.168|10\.|172\.)/ {split($3, a, "/"); print a[1]; exit}')
fi
if [[ -z $BIND_HOST ]]; then
  echo "error: could not auto-detect LAN IP — pass it as the 3rd argument." >&2
  exit 1
fi
echo "  LAN IP: $BIND_HOST"

# ── auto-detect feature flags ──────────────────────────────────────────────
ENABLE_DOCKER=false
if [[ -S /var/run/docker.sock ]] && docker ps >/dev/null 2>&1; then
  ENABLE_DOCKER=true
  echo "  Docker socket detected — ENABLE_DOCKER=true"
fi

# ENABLE_PM2 stays false by default. We're starting PM2 here to run the agent
# itself, but the PM2 collector is for monitoring USER apps under PM2. Flip it
# on in agent.env if this host runs other PM2-managed services worth tracking.

KEY=$(openssl rand -hex 24)

# ── install + build ────────────────────────────────────────────────────────
echo "==> Installing dependencies (filtered to agent + shared)..."
cd "$REPO_ROOT"
pnpm install --frozen-lockfile --filter '@homelab/shared' --filter '@homelab/agent'

echo "==> Building shared + agent..."
pnpm --filter @homelab/shared build
pnpm --filter @homelab/agent build

# ── write the env file PM2 will load ───────────────────────────────────────
cat >"$ENV_FILE" <<EOF
SERVER_ID=$ID
API_KEY=$KEY
BIND_HOST=$BIND_HOST
PORT=3005
ENABLE_DOCKER=$ENABLE_DOCKER
ENABLE_PM2=false
LOG_LEVEL=info
SAMPLE_INTERVAL_MS=5000
NODE_ENV=production
EOF
chmod 600 "$ENV_FILE"   # contains the API key
echo "  Wrote $ENV_FILE (chmod 600)"

# ── start under PM2 ────────────────────────────────────────────────────────
echo "==> Starting via PM2..."
cd "$AGENT_DIR"
pm2 start ecosystem.config.cjs

echo "==> Saving PM2 state so it survives reboot..."
pm2 save

cat <<EOF

✓ Agent up. id=$ID at http://$BIND_HOST:3005

To enable auto-start on system boot, run:
  pm2 startup
  # then run the sudo command it prints

Add to the monitor's servers.yaml:

  - id: $ID
    displayName: '$NAME'
    url: http://$BIND_HOST:3005
    apiKey: $KEY

Then on the monitor host:
  cd ~/homelab && git pull && cd packages/monitor && docker compose restart

Useful PM2 commands:
  pm2 logs home-server-beacon       # tail logs
  pm2 monit                    # live process info
  pm2 reload home-server-beacon     # zero-downtime restart after code change
  pm2 stop home-server-beacon       # stop
  pm2 delete home-server-beacon     # remove from PM2

If this host had a Docker-mode agent before, remove it:
  cd ~/homelab/packages/agent && docker compose down
EOF
