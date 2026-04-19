#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "==> Running backend pytest suite"
(
  cd "$ROOT_DIR/backend"
  "$PYTHON_BIN" -m pytest
)

echo "==> Running frontend component suite"
(
  cd "$ROOT_DIR/frontend"
  npm run test:component
)

echo "==> Running frontend end-to-end suite"
(
  cd "$ROOT_DIR/frontend"
  npm run test:e2e
)
