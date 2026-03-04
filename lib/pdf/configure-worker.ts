import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  workerConfigured = true;
}
