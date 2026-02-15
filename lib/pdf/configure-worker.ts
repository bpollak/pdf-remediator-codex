import { GlobalWorkerOptions, version as pdfJsVersion } from 'pdfjs-dist';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfJsVersion}/build/pdf.worker.min.mjs`;
  workerConfigured = true;
}
