# PDF Remediator

A browser-based PDF accessibility checker and helper for UC San Diego. Staff upload a PDF; the app checks it against
WCAG 2.1 AA / PDF/UA-oriented rules, applies the fixes it can make safely, and gives a plain-language checklist of what a
person still has to do before the PDF is published.

What it does and does not do:

- **Tagged PDFs** (exported from Word, PowerPoint or Google Docs as tagged PDFs): fixes metadata, tab order, bookmarks
  and heading levels, helps write and embed image descriptions, and verifies the result with veraPDF when configured.
- **Untagged PDFs**: the app reports what is missing and keeps the file honest (`analysis-only`). It does not invent a
  tag structure; the fix is to export a tagged PDF from the source file, or to tag it in Acrobat Pro.
- **Scanned PDFs**: OCR adds a searchable text layer to the first pages; the checklist says how many pages were covered.
- **No automated tool certifies accessibility.** The best result the app shows is "Passed automated checks — a person
  still needs to review it".

See [docs/campus-readiness-2026-10-28.md](docs/campus-readiness-2026-10-28.md) for the current review, the roadmap and
the decisions still needed before a campus-wide launch.

## Quick start

Requires Node 22 (see `.nvmrc`).

```bash
npm ci
```

```bash
npm run dev
```

Open http://localhost:3000. Optional services are configured in `.env.local` (copy `.env.local.example`); without them
the app still runs, and OCR falls back to in-browser Tesseract.

## Checks

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Next config) |
| `npm test` | All unit and integration tests (Vitest) |
| `npm run test:release-gate` | The PDF regression gate (structure binding, two-pass stability, fixture regressions) |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run test:e2e` | Browser suite (Playwright) against `LIVE_BASE_URL`, default the production site |

To run the browser suite locally against a production build:

```bash
npm run build && npx next start -p 3000
```

```bash
LIVE_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and push to `main`, plus a Docker build and
the unit tests of the OCR worker when it changes. CI itself needs no secrets: the AI and veraPDF services stay
unconfigured and their "not configured" paths are tested.

After CI succeeds on `main`, `.github/workflows/post-deploy.yml` deploys that commit to Vercel production with the
Vercel CLI (when the `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` repository secrets are set; otherwise it
relies on Vercel's GitHub integration), waits until production reports that commit from `/api/health`, then runs the
browser suite (regression, axe and a visual walkthrough) against the live site. The walkthrough screenshots are
published to the `qa/live-walkthrough` branch.

## How processing works

1. The file is validated (PDF magic bytes, 50 MB limit, up to 10 files per batch, up to 300 pages) and stored in this
   browser's IndexedDB.
2. The PDF is parsed in the browser (pdf.js + pdf-lib) and audited.
3. If it looks scanned, the browser sends page images to `POST /api/ocr/tritonai` (TritonAI LightOn OCR, with fallback
   models), then falls back to local Tesseract.
4. The remediated PDF is built in the browser and re-audited. When veraPDF is configured, the result is posted to
   `POST /api/verapdf` and the loop repeats (up to 3 passes) while the external check improves.
5. The results page shows the publish verdict, what was fixed, what is left, and the manual checklist. Saved image
   descriptions can be embedded into the downloaded PDF as content-bound Figure tags.

Digitally signed and permissions-restricted PDFs are refused with an explanation, because rewriting them would
invalidate the signature or produce a broken file.

## Server routes

| Route | Purpose |
|---|---|
| `POST /api/alt-text` | AI image-description suggestions (TritonAI LiteLLM gateway) |
| `POST /api/ocr/tritonai` | OCR for one page image |
| `POST /api/ocr` | Proxy to a PDF-native OCR worker (`services/ocrmypdf-worker`) |
| `GET/POST /api/verapdf` | veraPDF status and PDF/UA validation |
| `GET /api/health` | Which services are configured (booleans only, no outbound calls) |

All routes refuse cross-site browser requests and apply a per-instance rate limit. Errors are JSON with a stable `code`
(`invalid_request`, `payload_too_large`, `rate_limited`, `cross_site`, `not_configured`, `misconfigured`,
`upstream_auth`, `upstream_timeout`, `upstream_error`, `internal_error`); messages never name configuration settings.
Each request writes one JSON log line (request id, route, status, duration, model, token usage) and never logs
document content.

There is no sign-in yet. Until campus SSO is added, treat the deployment's TritonAI key as exposed to anyone who can
reach the site, and give it its own budget in the gateway.

## Environment variables

AI-assisted image descriptions:

- `LITELLM_API_KEY` (alias `TRITONAI_API_KEY`): TritonAI LiteLLM gateway key. Without it, suggestions are disabled.
- `LITELLM_BASE_URL` (alias `TRITONAI_BASE_URL`): gateway URL, default `https://tritonai-api.ucsd.edu`.
- `LITELLM_MODEL` (alias `TRITONAI_MODEL`): default `gpt-5.5`.
- `LITELLM_FALLBACK_MODELS` (alias `TRITONAI_FALLBACK_MODELS`): comma-separated, default
  `api-mistral-small-3.2-2506,api-gemma-4-26b`.
- `LITELLM_TIMEOUT_MS` (alias `TRITONAI_TIMEOUT_MS`): per-model timeout, default `20000`. The whole request is also
  bounded by the route's time limit.

OCR:

- `OCR_LITELLM_API_KEY`: TritonAI key for OCR; falls back to `LITELLM_API_KEY`. Use an on-prem key for the default
  model.
- `OCR_LITELLM_BASE_URL`, `OCR_LITELLM_MODEL` (default `api-lightonocr-1b`), `OCR_LITELLM_FALLBACK_MODELS`.
- `OCR_SERVICE_URL`, `OCR_SERVICE_TOKEN`, `OCR_SERVICE_API_KEY`, `OCR_TIMEOUT_MS` (default `240000`): optional
  OCRmyPDF worker behind `/api/ocr`.

veraPDF:

- `VERAPDF_SERVICE_URL`: veraPDF REST base URL or full validate endpoint. In local development it defaults to
  `http://127.0.0.1:8081`; on Vercel verification stays disabled without it.
- `VERAPDF_VALIDATION_PROFILE` (default `ua1`), `VERAPDF_SERVICE_TOKEN`, `VERAPDF_SERVICE_API_KEY`,
  `VERAPDF_TIMEOUT_MS` (default `120000`).

Hosting:

- `HTTPS_ONLY_HEADERS=true`: send HSTS and `upgrade-insecure-requests` when hosting behind TLS somewhere other than
  Vercel (on Vercel they are sent automatically).

Service URLs must use HTTPS except for loopback hosts.

## Local veraPDF

```bash
cp .env.local.example .env.local
```

```bash
npm run verapdf:up
```

`npm run verapdf:status` checks the service, `npm run verapdf:smoke` validates `fixtures/accessible.pdf`, and
`npm run verapdf:down` stops it.

## OCR worker

`services/ocrmypdf-worker/` is a FastAPI + OCRmyPDF service for `/api/ocr`. It requires `OCR_WORKER_API_KEY` (it refuses
requests without one unless `OCR_WORKER_ALLOW_UNAUTHENTICATED=true` is set for local development), checks auth and
size before reading uploads, runs as a non-root user, and limits concurrent jobs. See its README.

## Limits to know

- Vercel functions accept request bodies up to about 4.5 MB, so remediated PDFs larger than that are not sent to veraPDF
  online; the results page says to check them in PAC or Acrobat.
- Processing runs on the browser's main thread. Very large files (hundreds of pages) take minutes and need a lot of
  memory; keep the tab in front while they process.
- Results live only in this browser. Download the updated PDF to keep it; stored files expire after 30 days and can be
  cleared from the upload page.

## Release process

`AGENTS.md` describes the deployment workflow. Update `lib/content/release-notes.ts` with every user-visible change.
