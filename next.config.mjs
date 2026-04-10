/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@sentry/nextjs'],
  },
  // Next.js 14's built-in lint runner uses removed ESLint 9 options (useEslintrc, extensions).
  // ESLint runs via `npm run lint` instead, using eslint.config.mjs (flat config).
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
