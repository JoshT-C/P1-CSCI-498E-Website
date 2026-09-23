#!/usr/bin/env bash
# Run the room build inside Blender (Flatpak). Everything after the script
# name is passed through to art/room/build.py, e.g.
#   scripts/art.sh --preview /tmp/room.png --view doorway
#   scripts/art.sh --out public/assets/room
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec flatpak run --filesystem="$ROOT" --filesystem=/tmp \
  org.blender.Blender -b --factory-startup --python "$ROOT/art/room/build.py" -- "$@"
