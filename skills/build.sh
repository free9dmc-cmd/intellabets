#!/usr/bin/env bash
# Package each skill into an uploadable zip.
#
#   bash skills/build.sh
#
# Produces skills/dist/<name>.zip -- one per skill directory.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/*.zip

for dir in */; do
  name="${dir%/}"
  [ -f "$name/SKILL.md" ] || continue          # dist/, scripts/, etc.

  # Zip the DIRECTORY, not its contents: the archive must contain
  # <name>/SKILL.md, not a bare SKILL.md at the root.
  zip -rq "dist/$name.zip" "$name" -x '*.DS_Store' -x '__MACOSX/*'

  size=$(du -k "dist/$name.zip" | cut -f1)
  echo "  dist/$name.zip  (${size} KB)"
done

echo ""
echo "Upload each one, then record the skill_id it returns:"
echo "  ant skills create --file skills/dist/<name>.zip"
echo "Or drag the zip into the Skills section of the Anthropic Console."
