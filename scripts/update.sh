#!/usr/bin/env bash
# Run ON any host (agent or monitor) to apply the latest source.
#
# Usage:
#   ~/homelab/scripts/update.sh <agent|monitor>
#
# Detection logic for the agent:
#   - If packages/agent/agent.env exists → PM2 (native) mode
#   - Else                               → Docker mode

set -euo pipefail

ROLE="${1:-}"
case "$ROLE" in
  agent|monitor) ;;
  *) echo "Usage: $0 <agent|monitor>" >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"
git pull --ff-only

if [[ $ROLE == "agent" ]]; then
  if [[ -f $REPO_ROOT/packages/agent/agent.env ]]; then
    echo "==> Updating agent (PM2 / native mode)"
    pnpm install --frozen-lockfile --filter '@homelab/shared' --filter '@homelab/agent'
    pnpm --filter @homelab/shared build
    pnpm --filter @homelab/agent build
    pm2 reload home-server-beacon
  else
    echo "==> Updating agent (Docker mode)"
    cd "$REPO_ROOT/packages/agent"
    docker compose up -d --build
  fi
else
  echo "==> Updating monitor (Docker mode)"
  cd "$REPO_ROOT/packages/monitor"
  docker compose up -d --build
fi

echo "✓ $ROLE updated"
