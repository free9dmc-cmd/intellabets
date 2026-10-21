#!/bin/sh
# Base44 sandbox start-up for the Next.js web app.
#
# Runs inside the `web` service with ./web bind-mounted at /app, so everything
# it installs lands in the checkout (gitignored) and edits are picked up live.
# See AGENTS.md for why this installs per-package instead of via the workspace.
set -e

cd /app

# ─── Dependencies ────────────────────────────────────────────────────────────
# Installed from web/package.json rather than the repo-root lockfile: the root
# lockfile is stale with respect to web/package.json (@reown/appkit is pinned at
# 1.7.8 there while package.json requires 1.8.24), so `npm ci` fails against it.
# This mirrors backend/Dockerfile, which installs from package.json alone.
# --no-package-lock keeps npm from writing a lockfile into the checkout, and the
# stamp makes a restart with unchanged dependencies a no-op.
STAMP=node_modules/.base44-install-stamp
WANT=$(md5sum package.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$WANT" ]; then
  echo "[base44] installing web dependencies"
  npm install --workspaces=false --no-package-lock --legacy-peer-deps --no-audit --no-fund
  echo "$WANT" > "$STAMP"
else
  echo "[base44] web dependencies already installed"
fi

# ─── Prisma client and schema ────────────────────────────────────────────────
# web/ and backend/ have different Prisma schemas and, in this sandbox, their own
# node_modules — so generating one client does not clobber the other.
npx prisma generate
echo "[base44] applying the web Prisma schema"
npx prisma db push --skip-generate --accept-data-loss

# Demo data is seeded by the one-shot `seed` service (see
# .base44/seed-web.sh and docker-compose.base44.yml): prisma/seed.ts refuses any
# database that is not on localhost, and from this container the database is
# reached by service name.

# ─── Dev server ──────────────────────────────────────────────────────────────
echo "[base44] starting Next.js dev server on 0.0.0.0:3000"
exec npx next dev -H 0.0.0.0 -p 3000
