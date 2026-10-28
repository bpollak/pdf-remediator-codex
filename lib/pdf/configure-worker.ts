import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  // Copied from pdfjs-dist/legacy/build by scripts/copy-pdf-worker.mjs; it must
  // match the legacy build and version imported above.
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  workerConfigured = true;
}
