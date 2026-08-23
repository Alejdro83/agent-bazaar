/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  webpack: (config) => {
    // wagmi/RainbowKit's default connector list pulls in Coinbase's
    // cdp-sdk, whose x402 smart-account signing path references
    // @x402/core, @x402/svm, @x402/evm as optional deps we don't install
    // (we don't use the Coinbase Smart Wallet connector). Tell webpack to
    // treat them as empty rather than fail the build trying to resolve them.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core/client': false,
      '@x402/svm/exact/client': false,
      '@x402/evm': false,
      // Optional pretty-printer transport for pino (pulled in by
      // WalletConnect's logger) — not used at runtime, harmless to skip.
      'pino-pretty': false,
      // React Native storage shim MetaMask SDK's browser bundle references
      // for its RN build target — irrelevant on web.
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;