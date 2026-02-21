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
- `VERAPDF_SERVICE_URL` (optional): veraPDF REST base URL or full validate endpoint.
- `VERAPDF_VALIDATION_PROFILE` (optional): validation profile ID (default `ua1`).
- `VERAPDF_SERVICE_TOKEN` (optional): Bearer token for veraPDF backend auth.
- `VERAPDF_SERVICE_API_KEY` (optional): API key header (`x-api-key`) for veraPDF backend auth.
- `VERAPDF_TIMEOUT_MS` (optional): veraPDF request timeout in milliseconds (default `120000`).

If `OCR_SERVICE_URL` is not configured, OCR is skipped and processing continues with the original PDF.
When no backend is configured, local browser OCR fallback is attempted automatically.

If `VERAPDF_SERVICE_URL` is configured, remediated output is also posted to `POST /api/verapdf` so the compare page
can show an external PDF/UA compliance verdict and rule/check counts.
In local development, if `VERAPDF_SERVICE_URL` is unset, `/api/verapdf` falls back to `http://127.0.0.1:8081`.
When verification is enabled, remediation now runs in an iterative loop (up to 3 passes) and stops early on:
external compliance pass, no output change, no failed-check improvement, or service unavailability.
The compare view includes a "What To Do Next" panel that converts remaining findings and verification outcomes into
prioritized manual follow-up steps.

### Vercel deployment

Vercel cannot run Docker Compose in-serverless runtime. For production, host veraPDF REST externally and set:

- `VERAPDF_SERVICE_URL` (required to enable verification on Vercel)
- `VERAPDF_VALIDATION_PROFILE` (optional)
- `VERAPDF_SERVICE_TOKEN` / `VERAPDF_SERVICE_API_KEY` (optional auth)
- `VERAPDF_TIMEOUT_MS` (optional timeout)

If `VERAPDF_SERVICE_URL` is not set in Vercel, verification stays disabled and the UI reports "Not enabled".

### Local veraPDF (free/self-hosted)

1. Copy local env template:

```bash
cp .env.local.example .env.local
```

2. Start local veraPDF REST service:

```bash
npm run verapdf:up
```

3. Verify the service:

```bash
npm run verapdf:status
```

4. Run a smoke test against a fixture PDF:

```bash
npm run verapdf:smoke
```

5. Stop service when done:

```bash
npm run verapdf:down
```

`verapdf:smoke` validates `fixtures/accessible.pdf` via `/api/validate/ua1` and confirms a `validationReport` is returned.

### Recommended OCR backend

Use an OCRmyPDF-based worker service (self-hosted) and point `OCR_SERVICE_URL` at that service.

A ready-to-run template is included at:

- `services/ocrmypdf-worker/`

### Vercel note

Vercel function request body limits can affect very large PDF uploads routed through `/api/ocr`.
For larger scanned files, use an OCR backend that can ingest files directly (object storage URL pattern) and keep `/api/ocr` as orchestration/auth.
The same upload limit considerations apply to `/api/verapdf` if you run external verification in the request path.
