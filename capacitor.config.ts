// @ts-nocheck
// Run: npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
// Then: npx cap add ios && npx cap add android && npx cap sync

const config = {
  appId: "com.intellabets.app",
  appName: "IntellaBets",
  webDir: "out",
  // Points the mobile WebView to your live Vercel server so Next.js API routes work.
  // Change CAPACITOR_SERVER_URL in .env to your production URL before building.
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://intellabets.vercel.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#080b14",
      showSpinner: false,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#080b14",
    },
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
