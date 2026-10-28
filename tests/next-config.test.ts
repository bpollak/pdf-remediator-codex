import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadHeaders(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { default: config } = await import('../next.config.mjs');
  const [rule] = await config.headers();
  return new Map<string, string>(rule.headers.map((header: { key: string; value: string }) => [header.key, header.value]));
}

function directives(csp: string | undefined) {
  return new Map((csp ?? '').split('; ').map((part) => [part.split(' ')[0], part]));
}

describe('security headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds HSTS, upgrade-insecure-requests, frame-ancestors and form-action in production', async () => {
    const headers = await loadHeaders('production');
    const csp = directives(headers.get('Content-Security-Policy'));

    expect(headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(csp.get('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(csp.get('form-action')).toBe("form-action 'self'");
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
    expect(csp.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it("allows 'unsafe-eval' only in development, without HSTS or upgrades", async () => {
    const headers = await loadHeaders('development');
    const csp = directives(headers.get('Content-Security-Policy'));

    expect(csp.get('script-src')).toContain("'unsafe-eval'");
    expect(csp.get('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(headers.has('Strict-Transport-Security')).toBe(false);
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });
});
