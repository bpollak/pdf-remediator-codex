# Campus readiness review, October 28, 2026

Goal: take PDF Remediator from a working prototype to a service UC San Diego can offer campus-wide, so that faculty,
staff and students who are not accessibility experts can make their PDFs meet WCAG 2.1 AA (the ADA Title II
requirement for public universities), and know honestly when they cannot.

This supersedes the open items in [review-plan-2026-10-27.md](review-plan-2026-10-27.md).

## How the review was done

Five independent reviews read the code end to end and reproduced their findings with scripts and tests:

1. **PDF engine**: what the remediated file contains, and whether the audit's verdict can be trusted.
2. **Server and operations**: API routes, the OCR worker, security headers, readiness for campus scale.
3. **Client reliability**: queue, storage, memory and performance on realistic files (measured on 200–300 page,
   30–70 MB PDFs).
4. **UX and accessibility of the app itself**: walked every flow with a browser, keyboard and axe-core at desktop,
   mobile, 320 px and 200% zoom.
5. **Engineering quality and delivery**: tests, CI, tooling, docs.

Four implementation passes then fixed what could be fixed in code, each with tests, and the results were merged and
checked together (typecheck, lint, the full test suite, the release gate, a production build and the browser suite).

## The main finding

The app's biggest risk was not a crash or a vulnerability. It was that **it could tell a staff member a PDF was fixed
when it was not**:

- Missing titles were filled with "Accessible remediated PDF", a missing language silently became English, and the
  output claimed PDF/UA conformance in its metadata even for files the app itself classed as analysis-only.
- For untagged PDFs, the "remediated" file tagged an invisible, truncated copy of the text (about 16% of it survived in
  one test) while the real text stayed untagged, so a screen-reader user got less than from the original.
- Scores rose for files that were not fixed (a 7-page scan went from 15 to 79), and the top verdict read "Accessible".
- The checklist could reach 100% while blocking problems, such as a scan with no text, had no item.

For a campus service this is the failure that matters most: it puts inaccessible documents online with the
university's assurance attached. This release makes the app honest first, then hardens and improves it.

## What this release changes

### Honest output and verdicts (PDF engine and results)

- No invented metadata. Missing titles stay missing and are flagged (new title rule, WCAG 2.4.2). An assumed language
  is flagged for confirmation.
- PDF/UA is claimed only when the source's own structure is content-bound.
- Untagged documents are no longer given a synthetic invisible tag tree; they stay `analysis-only` and the checklist
  says to export a tagged PDF from the source or tag it in Acrobat.
- Scan detection uses page image coverage, not "has a structure tree"; tagged posters with described images are not
  treated as scans. OCR layer: no truncation or deduplication, follows page rotation.
- Analysis-only output is capped at 40; repeated violations cost more than one.
- New checks: empty tag trees fail, and page text not connected to tags is measured (DOC-007). Color contrast is
  reported as not checked instead of passing.
- Guessed form labels are written only when the label is clearly next to the field.
- veraPDF results count only for the PDF/UA-1 profile.
- Digitally signed PDFs are refused (rewriting them would invalidate the signature); existing XMP and viewer
  preferences are preserved.
- The top verdict is now "Passed automated checks — a person still needs to review it". The banner names the actual
  blocker and agrees with the checklist. The results page shows what was fixed and what is left. The checklist gains
  required items for OCR and remaining serious findings.

### Security and operations (server)

- One deadline per request, so fallback models are actually tried and the function never times out without an answer.
- OCR route: credential failures and timeouts return errors instead of an empty success; image size and page limits;
  untrusted text is delimited in prompts.
- Error responses carry a stable `code` and never name configuration settings; details go to structured logs.
- Cross-site guard falls back to `Origin`; limiter memory is bounded; client IP order documented.
- Security headers: `frame-ancestors`, `form-action`, HSTS and `upgrade-insecure-requests` on HTTPS deployments; `next
  dev` works under the CSP.
- `GET /api/health`.
- OCR worker: OCRmyPDF is actually installed, auth fails closed, uploads are checked before they are read, docs are
  off, it runs as non-root.

### Reliability (client)

See the client section of the PR description; summarized in the release notes.

### Accessibility and UX of the app

- Unique page titles, focus moved to the heading on navigation, a skip link, queue announcements for screen readers.
- A "Need help?" box pointing to campus accessibility help whenever a fix is needed outside the app; the footer
  feedback link no longer goes to the brand team.
- Plain-language errors with diagnostics behind "Details for support".
- Privacy and data-classification note on the upload page and next to AI suggestions.
- Home and About pages rewritten to be honest and task-first; release notes collapsed.
- The technical report is linked as "Technical report (for accessibility staff)" and agrees with the results page.

### Delivery

- GitHub Actions CI on every PR and push to `main` (typecheck, lint, production audit, tests with coverage, release
  gate, production build plus browser suite, OCR worker image), and Dependabot.
- Removed the stale e2e suite and the a11y-scan tooling whose dependency broke `npm ci` behind egress filters; the
  coverage script works.
- Test PDFs, Acrobat reports and screenshots (about 29 MB, including a scanned letter) are no longer served from
  `public/`.
- README and APPLICATION_SUMMARY rewritten to match the code.

## Decisions needed before a campus launch

These cannot be settled in code. Each blocks or shapes the launch.

| # | Decision | Why it matters | Recommendation | Owner |
|---|---|---|---|---|
| 1 | **Sign-in** | There is no authentication. Anyone who can reach the site can use the TritonAI key through `/api/ocr/tritonai` and `/api/alt-text`. Per-IP limits do not work on campus, where NAT and VPN put many users behind one address. | UCSD SSO for every page and API route (Entra ID via OIDC is the simplest on Vercel; Shibboleth/SAML needs a bridge). Then rate-limit per user. | ITS / service owner |
| 2 | **Data classification and AI processors** | Scanned pages and images go to TritonAI; the default alt-text model (`gpt-5.5`) is likely a commercial backend behind LiteLLM; the remediated PDF goes to the veraPDF host. | Get IT security and privacy sign-off on which protection levels (P1–P4) are allowed, name each processor in the privacy note, and route alt text to an on-prem or UC-contracted model unless approved. The copy is in `lib/content/privacy.ts`. | CISO / Privacy office |
| 3 | **Where veraPDF and the OCR worker run** | Vercel accepts request bodies up to about 4.5 MB, so most real campus PDFs cannot be verified online today. | Host both on campus or UC-contracted cloud, behind auth, and upload to them directly with short-lived signed tokens. | ITS |
| 4 | **Hosting agreement** | A campus service needs a Vercel Pro or Enterprise plan under a UC agreement (Hobby has no DPA), production-only secrets, and Deployment Protection on previews (each preview with secrets is another open proxy). | Move the project to a UC-owned Vercel team or campus hosting. | Service owner |
| 5 | **Help contact and feedback owner** | The "Need help?" box and footer link point to https://accessibility.ucsd.edu/ as a placeholder. | Name the team that answers remediation questions and the owner of tool feedback. Edit `lib/content/support.ts`. | Service owner |
| 6 | **TritonAI budget** | Spend is unbounded. | Give the app its own LiteLLM key with `rpm_limit` and `max_budget`. | TritonAI admins |
| 7 | **Scope statement** | The engine cannot tag untagged content (see below). | Launch as "check, fix metadata and structure details, and guide", with a clear path for untagged and scanned files (source-file export, Acrobat, campus help). | Service owner + Digital Accessibility |
| 8 | **Release process** | `AGENTS.md` says to push each change to `main`, which deploys to production with no review. | Merge through pull requests with the new CI as a required check on `main`. | Repo owner |

## Roadmap

### Phase 1: launch blockers (after decisions 1–4)

| Item | Effort |
|---|---|
| SSO middleware for pages and `/api/*`, session checked again inside each route; the guard already has a `getRequestIdentity()` seam | M |
| Per-user quotas in Upstash or Vercel KV (sliding window plus daily cap), Vercel Firewall rule on `/api/*` as a per-IP backstop | M |
| Direct uploads to veraPDF and the OCR worker (signed short-lived tokens), removing the 4.5 MB ceiling | M |
| Log drain and error tracking (Sentry or Vercel Observability); alert on 5xx rate, 429 rate, token spend | S–M |
| Redeploy the OCR worker with `OCR_WORKER_API_KEY` set (it now refuses requests without one) | S |
| `vercel.json` with `regions: ["sfo1"]`, next to TritonAI in San Diego | S |

### Phase 2: real remediation for untagged documents

This is the biggest capability gap. Today the app is an assessment and metadata tool for tagged PDFs, plus an image
description helper.

| Item | Effort |
|---|---|
| Tag the existing text-showing operators (BDC/MCID on the real content) instead of an invisible copy, artifact headers, footers and decoration | L |
| Tag links and form widgets (`/Link` and `/Form` elements with OBJR), set `/Contents` | M |
| Lists and tables from layout analysis, with the user confirming | L |
| Embedded Unicode font with ToUnicode for any generated text | M |
| OCR with real bounding boxes (OCRmyPDF hOCR or Tesseract), artifact the page image under the OCR text, merge into an existing tag tree instead of replacing it | M |
| Bold and font detection from real font names (pdf.js `commonObjs`) to improve heading detection | S |

### Phase 3: scale and performance

| Item | Effort |
|---|---|
| Move parse, audit and remediation into a Web Worker (the `lib/workers/client.ts` seam is in place); transfer buffers; `terminate()` gives real cancellation | M (2–4 days) |
| Store PDFs as Blobs and parse results in their own IndexedDB store; keep only the best pass in memory | M |
| Per-page progress during parsing; skip decoding images just to locate them | S–M |
| Batch download (.zip) of updated PDFs | S |

### Phase 4: quality

| Item | Effort |
|---|---|
| veraPDF in CI as a service, with a committed baseline of PDF/UA failure counts for the regression fixtures (today the gate grades the app with its own auditor) | M |
| Type-check the tests (`tsconfig.test.json`; about 22 typing errors to fix after deleting dead fixtures) | S–M |
| Next.js 16 (clears the remaining build-time PostCSS advisory) and ESLint flat config (covers `stores/` and `tests/`) | M |
| Route tests for `/api/verapdf` and `/api/ocr`, and `QueueProcessor` branch tests (OCR, loop, veraPDF) | M |
| Nonce-based CSP without `'unsafe-inline'`; self-host tesseract assets instead of cdn.jsdelivr.net | M |

## Launch checklist

- [ ] Decisions 1–8 made and recorded.
- [ ] SSO on every page and API route; per-user quotas; TritonAI budget key.
- [ ] veraPDF and OCR worker hosted on approved infrastructure, reachable without the 4.5 MB limit.
- [ ] Privacy note and help contact signed off and updated in `lib/content/`.
- [ ] CI required on `main`; production deploys only from merged PRs.
- [ ] Logs, error tracking and alerts in place; on-call owner named.
- [ ] Pilot with one or two departments on their real documents; compare results with Acrobat and PAC on a sample.
- [ ] Accessibility review of the app by Digital Accessibility staff, including a screen-reader walkthrough.

## Known limits to state plainly at launch

- Untagged PDFs are assessed, not tagged. The fix is to export a tagged PDF from the source file, or tag it in Acrobat.
- OCR covers the first pages of a scan, and its text positions are approximate.
- Online verification is limited by file size until direct uploads exist.
- Reading order, image description quality, color contrast and table semantics always need a person.
- Results are stored only in the browser that processed them.
