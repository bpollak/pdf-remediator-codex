# Code review and fix plan, October 27, 2026

Four parallel reviews (server and API, PDF core, client state and upload, report UI) read the code end to end. Each finding below was confirmed by reading the code path, and the PDF-core ones were also reproduced with scripts. This supersedes the open items in [CODE_REVIEW.md](CODE_REVIEW.md) (April 2026).

Baseline before any change: `main` at `629b5e5`, 252 tests passing, typecheck and lint clean, live site up.

## Phase 1: security and dependencies

| # | Fix | Where |
|---|-----|-------|
| 1.1 | Upgrade Next.js 14.2.35 to 15.5.28 and React 18 to 19. This clears the critical and high production advisories, including the App Router Server Components DoS. The April attempt was reverted only because the lock file couldn't be regenerated offline. | package.json, `[fileId]` pages, next.config.mjs |
| 1.2 | Shared API guard: refuse cross-site browser requests (`Sec-Fetch-Site`), rate-limit per route and per IP, and keep one copy of `resolveClientIp` | lib/rate-limit.ts, all four routes |
| 1.3 | OCR route: cap `documentName` and `language`, give each model its own timeout, and catch network errors so the fallback models are still tried | app/api/ocr/tritonai/route.ts |
| 1.4 | Alt-text route: give each model its own timeout (so a stalled primary model no longer cancels the fallbacks) and keep upstream error text out of responses | app/api/alt-text/route.ts |
| 1.5 | OCR proxy: stream the PDF instead of buffering it (avoids the 4.5 MB response cap) and check that the response is a PDF | app/api/ocr/route.ts |
| 1.6 | veraPDF: send the auth headers on the health probe, rate-limit GET, and return 502 (not 401) when the backend rejects our credentials. Parse service URLs properly. | app/api/verapdf/route.ts |
| 1.7 | OCR worker: run jobs in the threadpool with a concurrency limit; reject oversized uploads before parsing; copy uploads in chunks; compare keys in constant time; kill the whole process group on timeout | services/ocrmypdf-worker |

## Phase 2: PDF output correctness (PDF core)

| # | Fix |
|---|-----|
| 2.1 | Adding alt text corrupts bytes 0x80–0x9F in page content (windows-1252 decode). Use a 1:1 byte mapping. |
| 2.2 | Non-Latin characters in alt text, bookmarks and tooltips are garbled. Write them with `PDFHexString.fromText`. |
| 2.3 | Already-tagged images get a second, nested Figure. Set `/Alt` on the existing Figure instead. |
| 2.4 | The tag tree puts every heading first, repeats headings as paragraphs and loses column order. Build one list in reading order. |
| 2.5 | PDFs with only a permissions password produce broken output. Detect them early and explain what to do. |
| 2.6 | DOC-001 can pass without a real PDF/UA identifier. Read and write XMP `pdfuaid:part`. |
| 2.7 | Heading levels are renumbered so that siblings become parent and child (H1 H3 H3 → H1 H2 H3). Use a level stack. |
| 2.8 | Bold inline text becomes H1, and numbered headings are dropped. Tighten the heading heuristic. |
| 2.9 | New marked-content IDs can collide with existing ones. Start numbering after the highest existing ID. |
| 2.10 | The preview renderer leaks pdf.js documents and workers, and caches failed loads. Use an LRU cache with `destroy()`. |
| 2.11 | Form tooltips are never applied to nested field names. Match on the full field name. |
| 2.12 | Image crops and OCR positions are wrong on rotated pages. Use the viewport conversions. |

## Phase 3: processing queue and storage

| # | Fix |
|---|-----|
| 3.1 | The 120-second "stuck file" timeout lets several files process at once. Use a single lock, released only when the job ends. |
| 3.2 | The queue stops when the user leaves the upload page, and its lock resets on return. Run the queue from the `/app` layout with a module-level lock. |
| 3.3 | Failed saves, including running out of storage, are only logged, and the final save rewrites the original upload as well. Write only the PDFs that changed, and show save errors on the file card. |
| 3.4 | Restoring saved files loads every stored original PDF into memory. Skip originals for finished files; they load on demand. |
| 3.5 | A stalled OCR request leaves the file stuck and impossible to remove. Add a timeout per request, and allow Remove while processing. |
| 3.6 | Restore failures are hidden. Show them, and clean up records whose PDF is missing. |
| 3.7 | Files beyond the first 10 are dropped without a message. Tell the user. |
| 3.8 | Opening an unknown result link shows placeholder panels. Show "Result unavailable" instead. |
| 3.9 | The drop zone accepts files before saved files finish loading, which loses the link to the earlier review. Wait for restore first. |
| 3.10 | Zero-byte files and non-PDF files with an empty MIME type are accepted. Reject them. |

## Phase 4: results page and accessibility

| # | Fix |
|---|-----|
| 4.1 | Clicking a table or heading choice ticks "Fix document structure in Acrobat or PAC" as done, so the checklist reports 100% when no tags were added. Store the checkbox in its own field. |
| 4.2 | Duplicate React keys in the issue list. |
| 4.3 | The "Review in preview" button does nothing on every finding card. Remove it. |
| 4.4 | Score text and gray-400 text fail WCAG contrast. Use darker colours. |
| 4.5 | The image description fields have no accessible label. |
| 4.6 | The table yes/no choice is shown only by colour. Add `aria-pressed`. |
| 4.7 | Embed and suggestion results are not announced. Add live regions. |
| 4.8 | Ticking "Decorative" by accident erases the description. Keep it. |
| 4.9 | Every keystroke re-renders every thumbnail and writes to storage. Use stable thumbnail dependencies and debounce draft saves. |
| 4.10 | Download links are revoked too early (Safari). Revoke later; also revoke "open in new tab" links. |
| 4.11 | Remove the 14 unreachable report components and their dead code paths, and align the About page with what the app actually does. |
| 4.12 | Headings skip from h2 to h4, `HelpTip` doesn't close on Escape, and the thumbnail canvas has no role. |

## Not in this round (needs an account or infrastructure decision)

- **Shared rate limiter.** The in-memory limiter works per server instance. A real cap needs Upstash or Vercel KV, or Vercel Firewall rate-limit rules on `/api/*`.
- **Per-app TritonAI key with a budget.** Giving this app its own LiteLLM key with `rpm_limit` and `max_budget` is the control that actually limits spend. It's set in the TritonAI gateway, not in this repo.
- **CSP without `'unsafe-inline'`.** This needs nonce middleware, and it changes how every page is rendered. Doing it safely needs its own pass.
- **OCR worker deployment.** The worker fixes are in the repo, but the worker runs outside Vercel, so they take effect only when the worker is redeployed.

## Release

1. Merge the PDF-core branch into the review branch, then run the full suite, the release gate, typecheck, lint and a production build.
2. Update `lib/content/release-notes.ts` (required by AGENTS.md).
3. Open a PR and check the Vercel preview: upload a fixture end to end and confirm the API guard behaves.
4. Merge to `main`, which deploys to production. Then run the live regression suite against production.
