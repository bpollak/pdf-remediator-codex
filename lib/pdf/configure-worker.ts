import { GlobalWorkerOptions } from 'pdfjs-dist';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  workerConfigured = true;
}
