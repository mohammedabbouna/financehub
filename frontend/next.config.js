/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces .next/standalone/server.js — copied by the Dockerfile runner stage.
  // On Vercel we must NOT use 'standalone'; Vercel manages its own output.
  output: process.env.VERCEL ? undefined : 'standalone',
  // Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  // Permissions-Policy) are owned by nginx/nginx.conf — the single entry point.
  // Emitting them here as well would send duplicate/conflicting values.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
