// path: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // Fail build on TypeScript errors
    ignoreBuildErrors: false,
  },
  eslint: {
    // Fail build on ESLint errors
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
