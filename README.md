# PDF-Accessibility-Remediator-CODEX

## OCR for Scanned PDFs

The app now includes an OCR stage for scan-heavy PDFs before audit/remediation.

### How it works

1. Upload pipeline parses the PDF and checks if it appears scan-only (very low text density).
2. If likely scanned, the client calls `POST /api/ocr`.
3. The API route forwards the file to an OCR backend and expects a PDF response with an OCR text layer.
4. If backend OCR is unavailable, the browser falls back to local Tesseract OCR (first pages only).
5. Audit/remediation then run against OCR-enriched content.

### Environment variables

- `OCR_SERVICE_URL` (required for OCR): URL of your OCR backend endpoint.
- `OCR_SERVICE_TOKEN` (optional): Bearer token for OCR backend auth.
- `OCR_SERVICE_API_KEY` (optional): API key header (`x-api-key`) for OCR backend auth.
- `OCR_TIMEOUT_MS` (optional): OCR request timeout in milliseconds (default `240000`).

If `OCR_SERVICE_URL` is not configured, OCR is skipped and processing continues with the original PDF.
When no backend is configured, local browser OCR fallback is attempted automatically.

### Recommended OCR backend

Use an OCRmyPDF-based worker service (self-hosted) and point `OCR_SERVICE_URL` at that service.

A ready-to-run template is included at:

- `services/ocrmypdf-worker/`

### Vercel note

Vercel function request body limits can affect very large PDF uploads routed through `/api/ocr`.
For larger scanned files, use an OCR backend that can ingest files directly (object storage URL pattern) and keep `/api/ocr` as orchestration/auth.
