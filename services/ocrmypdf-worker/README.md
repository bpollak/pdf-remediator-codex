# OCRmyPDF Worker

Small FastAPI service that accepts a PDF upload and returns an OCR-processed PDF using `ocrmypdf`.

## Endpoint

- `POST /ocr`
  - multipart field `file` (PDF)
  - optional multipart field `language` (Tesseract language code, default `eng`)
  - response: `application/pdf`

## Auth

If `OCR_WORKER_API_KEY` is set, callers must send either:

- `Authorization: Bearer <OCR_WORKER_API_KEY>`, or
- `x-api-key: <OCR_WORKER_API_KEY>`

## Environment variables

- `OCR_WORKER_API_KEY` (optional): request auth secret.
- `OCR_MAX_UPLOAD_MB` (optional, default `75`): maximum PDF upload size.
- `OCR_TIMEOUT_SECONDS` (optional, default `240`): OCR execution timeout.
- `OCR_OCRMYPDF_JOBS` (optional, default `2`): OCRmyPDF parallel jobs.
- `OCRMYPDF_EXTRA_ARGS` (optional): additional OCRmyPDF CLI args.

## Local Docker run

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

## Wiring to the Next.js app

Set these in your Vercel project:

- `OCR_SERVICE_URL=https://<your-worker-host>/ocr`
- `OCR_SERVICE_TOKEN=<same value as OCR_WORKER_API_KEY>` (or use `OCR_SERVICE_API_KEY`)

The app will auto-attempt OCR when a PDF appears to be scan-heavy.
