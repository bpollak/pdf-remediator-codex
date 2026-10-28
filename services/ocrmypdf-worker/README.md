# OCRmyPDF Worker

Small FastAPI service that accepts a PDF upload and returns an OCR-processed PDF using `ocrmypdf`.

## Endpoints

- `POST /ocr`
  - multipart field `file` (PDF)
  - optional multipart field `language` (Tesseract language code, default `eng`)
  - requires a `Content-Length` header (chunked uploads are refused with 411)
  - response: `application/pdf`
- `GET /healthz`: `200 {"status": "ok"}`, or `503 {"status": "unavailable"}` when no API key is set or `ocrmypdf` is missing.

There are no `/docs`, `/redoc` or `/openapi.json` pages.

Errors are JSON with `error` (text) and `code`: `unauthorized` (401), `length_required` (411), `payload_too_large` (413), `not_configured` (503, no API key), `busy` (503, no OCR slot free within `OCR_QUEUE_WAIT_SECONDS`), `ocr_unavailable` (503, `ocrmypdf` not installed), `timeout` (504) and `ocr_failed` (502, with `exit_code`). OCRmyPDF's own error output is logged, not returned.

## Auth

The worker fails closed. Set `OCR_WORKER_API_KEY`, and callers must send either:

- `Authorization: Bearer <OCR_WORKER_API_KEY>`, or
- `x-api-key: <OCR_WORKER_API_KEY>`

Without a key every `/ocr` request gets a 503, unless `OCR_WORKER_ALLOW_UNAUTHENTICATED=true` is set. Use that only for local development.

Auth, `Content-Length`, the size limit and a free OCR slot are all checked before the upload body is read.

## Environment variables

- `OCR_WORKER_API_KEY` (required): request auth secret.
- `OCR_WORKER_ALLOW_UNAUTHENTICATED` (optional, local development only): `true` accepts requests without a key when `OCR_WORKER_API_KEY` is unset.
- `OCR_MAX_UPLOAD_MB` (optional, default `75`): maximum PDF upload size.
- `OCR_TIMEOUT_SECONDS` (optional, default `240`): OCR execution timeout.
- `OCR_OCRMYPDF_JOBS` (optional, default `2`): OCRmyPDF parallel jobs.
- `OCR_MAX_CONCURRENT` (optional, default `1`): OCR jobs run at once.
- `OCR_QUEUE_WAIT_SECONDS` (optional, default `30`): how long a request waits for a free OCR slot before getting a 503.
- `OCRMYPDF_EXTRA_ARGS` (optional): additional OCRmyPDF CLI args.

## Local Docker run

The image installs a pinned OCRmyPDF (see `requirements.txt`) and runs as a non-root user.

```bash
docker build -t ocrmypdf-worker ./services/ocrmypdf-worker
docker run --rm -p 8080:8080 \
  -e OCR_WORKER_API_KEY=replace-me \
  ocrmypdf-worker
```

Then test:

```bash
curl -X POST "http://localhost:8080/ocr" \
  -H "Authorization: Bearer replace-me" \
  -F "file=@/path/to/input.pdf" \
  -F "language=eng" \
  --output output.pdf
```

## Tests

The tests put a fake `ocrmypdf` on `PATH`, so they need only Python packages (`fastapi`, `python-multipart`, `httpx`):

```bash
cd services/ocrmypdf-worker
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests
```

## Wiring to the Next.js app

Set these in your Vercel project:

- `OCR_SERVICE_URL=https://<your-worker-host>/ocr`
- `OCR_SERVICE_TOKEN=<same value as OCR_WORKER_API_KEY>` (or use `OCR_SERVICE_API_KEY`)

The app will auto-attempt OCR when a PDF appears to be scan-heavy.
