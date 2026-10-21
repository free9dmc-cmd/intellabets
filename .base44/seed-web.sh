#!/bin/sh
# One-shot demo seed for the web database (Base44 sandbox).
#
# prisma/seed.ts deletes every user before inserting demo tipsters, so this runs
# it only against an empty database — a later boot with data in it prints a skip
# instead of wiping whatever the user created in the preview.
#
# The script also refuses any database that is not on localhost; the `seed`
# service therefore shares the db container's network namespace, so the database
# genuinely is on localhost from here and no database port is exposed on the
# sandbox. See docker-compose.base44.yml.
set -e

cd /app

if node -e 'const { PrismaClient } = require("@prisma/client"); const p = new PrismaClient(); p.user.count().then((c) => { p.$disconnect(); process.exit(c === 0 ? 0 : 1) }).catch(() => process.exit(0))'; then
  echo "[base44] empty database — seeding demo tipsters and the demo account"
  npx tsx prisma/seed.ts
else
  echo "[base44] demo data already present — not seeding"
fi
