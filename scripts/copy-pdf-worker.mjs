#!/usr/bin/env node
// Copy the pdf.js worker that matches the installed pdfjs-dist into public/.
// The app imports the legacy build (pdfjs-dist/legacy/build/pdf.mjs) for older
// Safari and Firefox, and the worker must come from the same build and version.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PDF_WORKER_SOURCE = join(dirname(require.resolve('pdfjs-dist/package.json')), 'legacy/build/pdf.worker.min.mjs');
export const PDF_WORKER_TARGET = join(root, 'public/pdf.worker.min.mjs');

mkdirSync(dirname(PDF_WORKER_TARGET), { recursive: true });
copyFileSync(PDF_WORKER_SOURCE, PDF_WORKER_TARGET);
const { version } = require('pdfjs-dist/package.json');
console.log(`Copied pdf.js ${version} legacy worker to public/pdf.worker.min.mjs`);
