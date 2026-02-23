/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com https://cdn.ucsd.edu",
              "worker-src 'self' blob:",
              "connect-src 'self' blob:",
              "img-src 'self' data: blob: https://cdn.ucsd.edu",
              "frame-src blob:",
              "object-src 'none'",
              "base-uri 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default nextConfig;
