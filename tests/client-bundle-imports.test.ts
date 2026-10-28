import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Modules loaded by the /app layout must not import the PDF toolchain
// statically; pdf-lib alone added about 190 kB to every /app page.
const HEAVY_MODULES = /from ['"](pdf-lib|pdfjs-dist[^'"]*|tesseract\.js)['"]|from ['"]@\/lib\/pdf\/(encryption|parser|renderer)['"]/;

function staticImports(file: string): string[] {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  return source.split('\n').filter((line) => /^import (?!type )/.test(line) && HEAVY_MODULES.test(line));
}

describe('upload page bundle', () => {
  it.each(['lib/pdf/pdf-errors.ts', 'lib/client/error-copy.ts', 'components/upload/QueueProcessor.tsx', 'stores/app-store.ts'])(
    '%s does not statically import pdf-lib, pdf.js or tesseract',
    (file) => {
      expect(staticImports(file)).toEqual([]);
    }
  );
});
