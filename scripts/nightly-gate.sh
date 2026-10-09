#!/usr/bin/env bash
# Merge gate for nightly branches. Run by the nightly runner (jasondearborn/scripts nightly/)
# before it merges to main. Protected: nightly sessions cannot edit this file.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s tests -q
if [ -f engine/package.json ]; then
  npm --prefix engine ci --no-audit --no-fund
  npm --prefix engine test
fi
