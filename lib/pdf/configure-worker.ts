import { GlobalWorkerOptions } from 'pdfjs-dist';

let workerConfigured = false;
const PDFJS_WORKER_VERSION = '4.5.136';

export function ensurePdfJsWorkerConfigured() {
  if (workerConfigured || typeof window === 'undefined') return;

  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_WORKER_VERSION}/build/pdf.worker.min.mjs`;
  workerConfigured = true;
}
