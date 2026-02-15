import { GlobalWorkerOptions } from 'pdfjs-dist';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs';
  workerConfigured = true;
}
