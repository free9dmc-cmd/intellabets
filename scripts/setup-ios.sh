#!/usr/bin/env bash
# IntellaBets — one-shot iOS setup script (run on Mac with Xcode installed)
# Usage:  bash scripts/setup-ios.sh

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() { echo -e "${BLUE}==> ${1}${NC}"; }
ok()  { echo -e "${GREEN}✓ ${1}${NC}"; }
warn(){ echo -e "${YELLOW}⚠ ${1}${NC}"; }
err() { echo -e "${RED}✗ ${1}${NC}"; exit 1; }

# ---- Prerequisites ----
say "Checking prerequisites"

command -v node >/dev/null 2>&1 || err "Node.js not installed. Install from https://nodejs.org (v18+)"
command -v npm  >/dev/null 2>&1 || err "npm not found"
command -v xcodebuild >/dev/null 2>&1 || err "Xcode not installed. Install from the Mac App Store"
command -v pod >/dev/null 2>&1 || {
  warn "CocoaPods not installed — installing now"
  sudo gem install cocoapods
}

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 18 ] || err "Node 18+ required (you have $(node -v))"
ok "Node $(node -v), Xcode $(xcodebuild -version | head -1 | awk '{print $2}'), CocoaPods $(pod --version)"

# ---- Install npm dependencies ----
say "Installing npm dependencies"
npm install
ok "Dependencies installed"

# ---- Add iOS platform ----
if [ -d "ios" ]; then
  ok "iOS platform already added"
else
  say "Adding iOS platform"
  npx cap add ios
  ok "iOS platform created at ./ios"
fi

# ---- Sync web assets + native plugins ----
say "Syncing Capacitor (web assets + RevenueCat plugin → iOS)"
npx cap sync ios
ok "Capacitor sync complete"

# ---- Install CocoaPods dependencies ----
say "Installing iOS pods"
cd ios/App && pod install && cd ../..
ok "Pods installed"

# ---- Done ----
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  iOS project is ready. Opening Xcode...${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps inside Xcode (see docs/xcode-checklist.md for detail):${NC}"
echo ""
echo "  1. Click 'App' in left sidebar → Signing & Capabilities tab"
echo "     • Check 'Automatically manage signing'"
echo "     • Select your Team (Apple Developer account)"
echo "     • Bundle Identifier: com.intellabets.app"
echo ""
echo "  2. Still on Signing & Capabilities → click '+ Capability'"
echo "     • Add 'In-App Purchase'"
echo ""
echo "  3. General tab:"
echo "     • Display Name: IntellaBets"
echo "     • Minimum Deployments: iOS 15.0"
echo ""
echo "  4. Top bar: switch device to 'Any iOS Device (arm64)'"
echo ""
echo "  5. Menu: Product → Archive  (takes 2-3 min)"
echo ""
echo "  6. Organizer opens automatically → Distribute App"
echo "     → App Store Connect → Upload"
echo ""
echo -e "${BLUE}After upload, your build appears in App Store Connect → TestFlight in ~10 min.${NC}"
echo ""

npx cap open ios
