# IntellaBets — Xcode + App Store Connect IAP Checklist

Complete these steps once on your Mac. First-time setup takes ~45 minutes.

---

## Part A — App Store Connect (do first, in your browser)

### 1. Create the App
1. Go to https://appstoreconnect.apple.com → **My Apps → +**
2. New App:
   - Platform: **iOS**
   - Name: **IntellaBets**
   - Primary Language: English (U.S.)
   - Bundle ID: **com.intellabets.app** (must match Xcode exactly)
   - SKU: `intellabets-001`
   - User Access: Full Access

### 2. Create the Subscription Group
1. Your app → **Monetization → Subscriptions** (left sidebar)
2. Click **+** next to "Subscription Groups"
3. Reference Name: `IntellaBets Memberships`

### 3. Add All 12 Subscription Products

For **each** of these, click **+** next to "Subscriptions" inside the group:

| Product ID | Reference Name | Price |
|---|---|---|
| `com.intellabets.premium` | Premium Tipster | $19.99/mo |
| `com.intellabets.ai` | AI Picks | $9.99/mo |
| `com.intellabets.tipster_499` | Tipster $4.99 | $4.99/mo |
| `com.intellabets.tipster_999` | Tipster $9.99 | $9.99/mo |
| `com.intellabets.tipster_1499` | Tipster $14.99 | $14.99/mo |
| `com.intellabets.tipster_1999` | Tipster $19.99 | $19.99/mo |
| `com.intellabets.tipster_2499` | Tipster $24.99 | $24.99/mo |
| `com.intellabets.tipster_2999` | Tipster $29.99 | $29.99/mo |
| `com.intellabets.tipster_3499` | Tipster $34.99 | $34.99/mo |
| `com.intellabets.tipster_3999` | Tipster $39.99 | $39.99/mo |
| `com.intellabets.tipster_4499` | Tipster $44.99 | $44.99/mo |
| `com.intellabets.tipster_4999` | Tipster $49.99 | $49.99/mo |

For each product:
- Duration: **1 Month**
- Price: tier matching the name
- **Localization → English:** Display Name + Description (2 sentences is fine)
- **Review Information:** screenshot optional (can add later)
- Save

All products will start as **"Ready to Submit"** — that's correct. They go live when the app is approved.

---

## Part B — RevenueCat (free, ~5 minutes)

1. Sign up at https://app.revenuecat.com
2. **Project → +New Project** → name: `IntellaBets`
3. **Apps → +New** → iOS → Bundle ID: `com.intellabets.app`
4. RevenueCat will guide you to upload your **App Store Connect API Key**:
   - In App Store Connect → **Users and Access → Integrations → App Store Connect API**
   - Generate a key with **Admin** role
   - Download the `.p8` file
   - Paste Key ID, Issuer ID, and upload `.p8` into RevenueCat
5. In RevenueCat → **Products** → **Import from App Store** — imports all 12 products
6. Copy the **iOS SDK Key** (`appl_xxxxxxx`) from **Project Settings → API Keys**
7. **Integrations → Webhooks** → Add:
   - URL: `https://intellabets.vercel.app/api/webhooks/revenuecat`
   - Copy the shared secret
8. Add these to your Vercel env vars:
   - `NEXT_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxx`
   - `REVENUECAT_WEBHOOK_SECRET=<secret>`
9. Redeploy Vercel so the env vars take effect.

---

## Part C — Xcode (on your Mac, ~15 min)

Run this in Terminal from the project root:
```bash
bash scripts/setup-ios.sh
```

This will install dependencies, generate the iOS project, and open Xcode. Then:

### 1. Configure Signing
- Left sidebar → click **`App`** (blue icon at top)
- Top tab: **Signing & Capabilities**
- Check **☑ Automatically manage signing**
- **Team:** select your Apple Developer account
- **Bundle Identifier:** `com.intellabets.app`

### 2. Add In-App Purchase Capability
- Still on Signing & Capabilities tab
- Click **+ Capability** (top-left of the editor)
- Double-click **In-App Purchase**
- You should now see "In-App Purchase" listed in the capabilities

### 3. Configure General Settings
- Top tab: **General**
- **Display Name:** IntellaBets
- **Version:** 1.0.0
- **Build:** 1
- **Minimum Deployments:** iOS 15.0
- **Identity → App Icon:** if you don't have one yet, a placeholder is OK for TestFlight

### 4. Set Up Info.plist Strings (Required)
- Left sidebar → **App → App → Info.plist**
- Add these if not present:
  - `NSCameraUsageDescription` → "IntellaBets uses the camera to let you set a profile photo."
  - `NSPhotoLibraryUsageDescription` → "IntellaBets uses your photo library to let you set a profile photo."

  (Required even if unused — Apple scans for them.)

### 5. Set CAPACITOR_SERVER_URL in capacitor.config
Before archiving, make sure your `.env` on the Mac has:
```
CAPACITOR_SERVER_URL=https://intellabets.vercel.app
```
Then run:
```bash
npx cap sync ios
```

### 6. Archive
- Top bar: change device from "iPhone 15 Simulator" to **"Any iOS Device (arm64)"**
- Menu: **Product → Archive** (takes 2–3 minutes)
- When done, **Organizer** window opens automatically

### 7. Upload to App Store Connect
- In Organizer, select your new archive
- Click **Distribute App**
- Choose **App Store Connect** → **Upload** → Next through all screens
- Accept automatic signing → **Upload**
- Wait for "Upload Successful"

### 8. Wait for Processing
- In App Store Connect → your app → **TestFlight** tab
- Your build will appear in ~10 min with a yellow "Processing" badge
- When it turns green, you can test it on your iPhone via the **TestFlight app**

---

## Part D — Submit for Review

1. App Store Connect → your app → **App Store** tab
2. Fill in required fields:
   - **Promotional Text** (170 chars) — optional but recommended
   - **Description** (4000 chars)
   - **Keywords** (100 chars, comma-separated, no spaces): `sports,betting,picks,parlay,NFL,NBA,AI,tipster,odds,analytics`
   - **Support URL:** `https://intellabets.vercel.app`
   - **Marketing URL:** `https://intellabets.vercel.app`
3. **Build:** click **+ Select Build** → pick your uploaded build
4. **Age Rating:** Edit → run questionnaire
   - Contests: Infrequent
   - **Simulated Gambling: Frequent/Intense** → results in **17+**
5. **App Privacy:** click Edit → declare:
   - Contact Info (Email) — linked to user
   - Identifiers (User ID) — linked to user
   - Usage Data — linked to user
   - Purchases — linked to user
6. **Pricing and Availability:**
   - Price: Free (the app is free; subscriptions are IAP)
   - Availability: all territories where sports info is legal (default is fine)
7. **App Review Information:**
   - Sign-in required: **Yes**
   - Demo Account:
     - Username: `demo@intellabets.com`
     - Password: `password123`
   - Notes: "Demo account has active Premium + AI subscriptions for testing."
8. **Screenshots** (6.7" iPhone required):
   - Take in iOS Simulator: `File → New Screenshot` (Cmd+S) at iPhone 15 Pro Max
   - Need at least 3; recommended 5–10
9. Click **Save** → **Add for Review** → **Submit to App Review**

**Review takes 24–48 hours typically.** You'll get an email when approved or if they need more info.

---

## Common Rejection Reasons & Fixes

| Rejection | Fix |
|---|---|
| "App uses external payments" | Make sure no Stripe UI is reachable on iOS. Our code handles this. |
| "Insufficient app functionality" | Make sure demo account has active subscriptions + sample betslips. Seed the DB before review. |
| "No privacy policy" | Privacy URL is required — we have `/privacy`. |
| "Missing age verification" | We have the AgeGate component — make sure it appears on first launch. |
| "App crashes on launch" | Test thoroughly in TestFlight before submitting. |

---

## After Approval

- Your app goes live on the App Store within a few hours of approval
- RevenueCat automatically processes real purchases and hits the webhook
- Payouts: Apple pays you ~month-end → you pay tipsters the 80% share → IntellaBets keeps 20%
- Apple takes their own 15-30% off the top (15% after year 1 of a subscriber)

**Note on Apple's cut:** Apple takes 30% of year-1 subscriptions, 15% after that. Your effective math:
- $19.99/mo Premium → Apple takes ~$6, you get $13.99
- $9.99 tipster sub → Apple takes ~$3, you get $6.99; tipster gets 80% of $6.99 = $5.59; you keep $1.40

If you want the full 20% platform fee, run promotions pushing users to the **web** (not iOS) where Stripe takes only 2.9%.
