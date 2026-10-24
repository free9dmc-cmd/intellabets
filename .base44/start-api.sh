#!/bin/sh
# Base44 sandbox start-up for the NestJS prediction engine.
#
# Runs inside the `api` service with ./backend bind-mounted at /app, so edits are
# picked up by `nest start --watch`. See AGENTS.md for why this installs
# per-package instead of via the workspace.
set -e

cd /app

# ─── Dependencies ────────────────────────────────────────────────────────────
# Installed from backend/package.json (the same way backend/Dockerfile does it,
# whose build context is the backend directory alone). The stamp makes a restart
# with unchanged dependencies a no-op.
STAMP=node_modules/.base44-install-stamp
WANT=$(md5sum package.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$WANT" ]; then
  echo "[base44] installing API dependencies"
  # Start clean whenever package.json changes: an in-place install keeps the
  # versions already installed, so new npm overrides would not take effect.
  rm -rf node_modules
  npm install --workspaces=false --no-package-lock --legacy-peer-deps --no-audit --no-fund
  echo "$WANT" > "$STAMP"
else
  echo "[base44] API dependencies already installed"
fi

# ─── Prisma client and schema ────────────────────────────────────────────────
npx prisma generate
echo "[base44] applying the engine Prisma schema"
npx prisma db push --skip-generate --accept-data-loss

# ─── Dev server ──────────────────────────────────────────────────────────────
# Odds ingestion stays idle until THE_ODDS_API_KEY is set; the rest of the API
# (de-vig engine, predictions, Swagger) runs without it.
echo "[base44] starting NestJS dev server on 0.0.0.0:4000"
exec npm run dev
