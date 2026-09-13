#!/usr/bin/env bash
# IntellaBets — one-shot deploy prep.
# Run from the repo root:  bash scripts/prep-deploy.sh
#
# Does everything that must happen BEFORE the Vercel import, then prints the
# exact environment variables to paste in.

set -uo pipefail

B='\033[0;34m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
say(){ echo -e "${B}==> ${1}${N}"; }
ok(){ echo -e "${G}✓ ${1}${N}"; }
warn(){ echo -e "${Y}⚠ ${1}${N}"; }
die(){ echo -e "${R}✗ ${1}${N}"; exit 1; }

command -v node >/dev/null || die "Node.js not installed — get it from nodejs.org"
command -v git  >/dev/null || die "git not installed"
[ -d web ] || die "Run this from the repo root (the folder containing web/ and backend/)"

say "Pulling latest"
git pull --ff-only || warn "Could not fast-forward. Commit or stash local changes, then re-run."

say "Installing dependencies (a few minutes on first run)"
npm install >/dev/null 2>&1 || die "npm install failed. Run 'npm install' on its own to see the error."
ok "Dependencies installed"

# ── Database ─────────────────────────────────────────────────────────────────
echo ""
say "Database"
echo "Paste your Neon connection string (starts with postgresql://)."
echo "Get it at neon.tech → your project → Connection String."
echo -e "${Y}Use a ROTATED password if the old one was ever shared.${N}"
read -r -p "DATABASE_URL: " DB_URL
[ -n "${DB_URL}" ] || die "A database URL is required."

say "Creating tables in Neon"
( cd web && DATABASE_URL="$DB_URL" npx prisma db push ) || die "Schema push failed — check the connection string."
ok "Tables created"

read -r -p "Seed demo tipsters and picks so the site isn't empty? [y/N] " SEED
if [[ "${SEED:-n}" =~ ^[Yy]$ ]]; then
  ( cd web && DATABASE_URL="$DB_URL" npx tsx prisma/seed.ts ) && ok "Seeded" || warn "Seed failed (not fatal)"
fi

# ── Secrets ──────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ENGINE_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

cat <<EOF

────────────────────────────────────────────────────────────────────────────
 PASTE THESE INTO VERCEL  (Project → Settings → Environment Variables)
 Set every one to the **Production** environment.
────────────────────────────────────────────────────────────────────────────

DATABASE_URL
${DB_URL}

NEXTAUTH_SECRET
${NEXTAUTH_SECRET}

NEXTAUTH_URL
https://intellabets.com

NEXT_PUBLIC_APP_URL
https://intellabets.com

ADMIN_EMAILS
$(git config user.email 2>/dev/null || echo "your@email.com")

ANTHROPIC_API_KEY
<your sk-ant-... key>

ENGINE_API_URL
https://api.intellabets.com/api/v1

ENGINE_SERVICE_KEY
${ENGINE_KEY}

────────────────────────────────────────────────────────────────────────────
 ALSO add this ONE variable in RENDER (service: intellabets-api → Environment)
 It must match the value above exactly, or the picks page stays empty.
────────────────────────────────────────────────────────────────────────────

ENGINE_SERVICE_KEY
${ENGINE_KEY}

────────────────────────────────────────────────────────────────────────────
 THEN, in Vercel:
   1. vercel.com/new → import  free9dmc-cmd/intellabets
   2. Root Directory → Edit → select  web     <-- the one setting that must be right
   3. Paste the variables above
   4. Deploy
────────────────────────────────────────────────────────────────────────────

Stripe keys are intentionally absent: add STRIPE_SECRET_KEY and
STRIPE_WEBHOOK_SECRET once your processor is approved. Until then checkout
returns a clear 503 instead of silently granting free access.

EOF
ok "Ready to import."
