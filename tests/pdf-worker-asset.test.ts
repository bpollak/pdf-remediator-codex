import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('pdf.js worker asset', () => {
  it('public/pdf.worker.min.mjs is the installed pdfjs-dist legacy worker (run scripts/copy-pdf-worker.mjs)', () => {
    const packageDir = dirname(require.resolve('pdfjs-dist/package.json'));
    const installed = readFileSync(join(packageDir, 'legacy/build/pdf.worker.min.mjs'));
    const served = readFileSync(join(__dirname, '..', 'public/pdf.worker.min.mjs'));

    expect(served.byteLength).toBe(installed.byteLength);
    expect(served.equals(installed)).toBe(true);
  });
});
