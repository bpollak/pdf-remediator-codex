/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
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
              // 'unsafe-inline' is required by Next.js for inline bootstrap scripts.
              // 'wasm-unsafe-eval' is required by tesseract.js (WASM-based OCR).
              // blob: is required for pdf.js web-worker scripts.
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com https://cdn.ucsd.edu",
              "worker-src 'self' blob:",
              "connect-src 'self' blob: https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https://cdn.ucsd.edu",
              "frame-src blob:",
              "object-src blob:",
              "base-uri 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default nextConfig;
