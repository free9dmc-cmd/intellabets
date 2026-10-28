/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // In the Base44 sandbox the preview is served from a different origin
  // (https://3000-$BASE44_PUBLIC_HOST_SUFFIX) than the dev server's own, and
  // Next refuses to serve dev assets or the HMR channel to an origin that is
  // not listed here ("Cross origin request detected ... allowedDevOrigins").
  // Gated on the sandbox flag: with BASE44_PREVIEW_MODE unset or any other
  // value this stays undefined, so production behaviour is unchanged.
  allowedDevOrigins:
    process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX
      ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
      : undefined,
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "*.vercel.app",
        process.env.NEXT_PUBLIC_APP_URL?.replace("https://", "") ?? "",
      ].filter(Boolean),
    },
  },
  webpack: (config) => {
    // The wagmi "Base Account" connector (pulled in transitively by Reown
    // AppKit's wagmi adapter) reaches into Coinbase's CDP SDK, whose optional
    // x402 payment peers we do not install and never use — our wallet rail only
    // does a plain ERC-20 transfer via injected / WalletConnect. Alias those
    // optional peers (and pino-pretty, another optional WalletConnect logger dep)
    // to false so webpack treats them as empty modules instead of failing to
    // resolve them. This never runs at runtime; it only unblocks the build.
    // The MetaMask SDK (same connector chain) likewise requires React Native's
    // AsyncStorage, but only inside a try/catch on its React-Native-only code
    // path, so it gets the same empty-module alias.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/extensions": false,
      "@x402/svm": false,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    }
    return config
  },
}

module.exports = nextConfig
