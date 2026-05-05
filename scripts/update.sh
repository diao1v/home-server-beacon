#!/usr/bin/env bash
# Run ON any host (agent or monitor) to apply the latest source.
# Pulls the repo, rebuilds the local container, restarts.
#
# Usage:
#   ~/homelab/scripts/update.sh <agent|monitor>

set -euo pipefail

ROLE="${1:-}"
case "$ROLE" in
  agent|monitor) ;;
  *) echo "Usage: $0 <agent|monitor>" >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"
git pull --ff-only

cd "packages/$ROLE"
docker compose up -d --build

echo "✓ $ROLE updated"
