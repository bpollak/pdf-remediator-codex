const isDevelopment = process.env.NODE_ENV === 'development';
// Vercel deployments are HTTPS only. Local and CI `next start` builds are
// served over plain http, where upgrade-insecure-requests would break every
// asset request, so the HTTPS-only headers follow the deployment, not
// NODE_ENV. Set HTTPS_ONLY_HEADERS=true when hosting behind TLS elsewhere.
const isHttpsDeployment = process.env.VERCEL === '1' || process.env.HTTPS_ONLY_HEADERS === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
          ...(isHttpsDeployment
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
            : []),
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-inline' is required by Next.js for inline bootstrap scripts.
              // 'wasm-unsafe-eval' is required by tesseract.js (WASM-based OCR).
              // blob: is required for pdf.js web-worker scripts.
              // 'unsafe-eval' is added in development only: webpack's dev
              // build evaluates modules with eval(), and without it the app
              // never hydrates under `next dev`.
              `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ''} blob: https://cdn.jsdelivr.net`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com https://cdn.ucsd.edu",
              "worker-src 'self' blob:",
              "connect-src 'self' blob: https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https://cdn.ucsd.edu",
              "frame-src blob:",
              "object-src blob:",
              "base-uri 'self'",
              // The app is never embedded; X-Frame-Options covers older browsers.
              "frame-ancestors 'none'",
              "form-action 'self'",
              ...(isHttpsDeployment ? ['upgrade-insecure-requests'] : [])
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default nextConfig;
