import type { NextConfig } from 'next';

/**
 * In production (Firebase App Hosting) the browser calls the API same-origin at /api/v1/...
 * and Next.js proxies it to the Cloud Function origin given in API_PROXY_ORIGIN
 * (e.g. https://us-east4-<project>.cloudfunctions.net/api). Locally the client calls the
 * Functions emulator directly via NEXT_PUBLIC_API_BASE_URL, so no rewrite is needed.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@tms/shared'],
  reactStrictMode: true,
  devIndicators: { position: 'bottom-right' },
  async rewrites() {
    const origin = process.env.API_PROXY_ORIGIN;
    if (!origin) return [];
    return [{ source: '/api/:path*', destination: `${origin.replace(/\/$/, '')}/api/:path*` }];
  },
};

export default nextConfig;
