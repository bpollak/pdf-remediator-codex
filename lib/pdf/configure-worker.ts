import { GlobalWorkerOptions } from 'pdfjs-dist';

let workerConfigured = false;

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  workerConfigured = true;
}
