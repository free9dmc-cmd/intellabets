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

# Deliberately NOT seeding.
#
# prisma/seed.ts inserts invented tipsters with invented track records --
# win rates, subscriber counts, earnings, isVerified: true. That is fine for
# local development and unacceptable on a site that takes money: it is
# fabricated performance data shown to paying customers, and it is what a
# payment processor's underwriters look for. Run it by hand against a local
# database if you want a populated dev environment:
#
#   cd web && DATABASE_URL="<local db>" npx tsx prisma/seed.ts
#
# An empty leaderboard on launch day is honest. A fake one is not.
warn "Skipping demo seed -- production starts with real data only."

# ── Secrets ──────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ENGINE_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Secrets are written to a file, NOT printed here.
#
# Printing them puts live credentials in terminal scrollback, which then get
# pasted wholesale into chat windows, screenshots and support threads. A file
# you open deliberately is harder to leak by accident, and if it does leak you
# can delete it. DEPLOY-SECRETS.txt is gitignored.
SECRETS_FILE="DEPLOY-SECRETS.txt"
umask 077
cat > "$SECRETS_FILE" <<SECRETS
IntellaBets deploy secrets - generated $(date)

Treat this file like a password. Do not paste its contents into chat, a
screenshot, an issue or a commit. Delete it once the values are in Vercel:

    rm DEPLOY-SECRETS.txt

DATABASE_URL
${DB_URL}

NEXTAUTH_SECRET
${NEXTAUTH_SECRET}

ENGINE_SERVICE_KEY
${ENGINE_KEY}

The ENGINE_SERVICE_KEY above also goes in Render
(service: intellabets-api -> Environment). It must match exactly, or the
picks page stays empty.
SECRETS
chmod 600 "$SECRETS_FILE"

cat <<EOF

────────────────────────────────────────────────────────────────────────────
 VERCEL ENVIRONMENT VARIABLES  (Project → Settings → Environment Variables)
 Set every one to the **Production** environment.
────────────────────────────────────────────────────────────────────────────

 These three are SECRET. They are in ${SECRETS_FILE} in this folder --
 open it, copy them into Vercel, then delete the file.

   DATABASE_URL
   NEXTAUTH_SECRET
   ENGINE_SERVICE_KEY

 These are safe to read off the screen:

NEXTAUTH_URL
https://<your-project>.vercel.app      <-- see note below

NEXT_PUBLIC_APP_URL
https://<your-project>.vercel.app      <-- see note below

ADMIN_EMAILS
$(git config user.email 2>/dev/null || echo "<the email you log in with>")

ANTHROPIC_API_KEY
<your sk-ant-... key from console.anthropic.com>

ENGINE_API_URL
https://api.intellabets.com/api/v1

────────────────────────────────────────────────────────────────────────────
 THEN, in Vercel:
   1. vercel.com/new → import  free9dmc-cmd/intellabets
   2. Root Directory → Edit → select  web     <-- the one setting that must be right
   3. Add the variables above
   4. Deploy
   5. rm DEPLOY-SECRETS.txt

 ABOUT THE TWO URL VARIABLES
   Vercel gives you a <project>.vercel.app address as soon as the first
   deploy finishes. Use THAT for NEXTAUTH_URL and NEXT_PUBLIC_APP_URL to
   begin with. If you point them at intellabets.com before DNS is pointed
   at Vercel, every login will redirect to a dead address.

   Once intellabets.com resolves to the app, change both variables to
   https://intellabets.com and redeploy. That switch is the last step, not
   the first.

 ABOUT ADMIN_EMAILS
   This is the ONLY thing that grants /admin access, matched against the
   email you sign in with. If it is wrong or unset, nobody is an admin.
────────────────────────────────────────────────────────────────────────────

Stripe keys are intentionally absent: add STRIPE_SECRET_KEY and
STRIPE_WEBHOOK_SECRET once your processor is approved. Until then checkout
returns a clear 503 instead of silently granting free access.

EOF
ok "Ready to import."
