/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
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
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/extensions": false,
      "@x402/svm": false,
      "pino-pretty": false,
    }
    return config
  },
}

module.exports = nextConfig
