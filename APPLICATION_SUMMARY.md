# Application summary

Last updated October 28, 2026. For setup and configuration see [README.md](README.md); for the review history and
roadmap see [docs/campus-readiness-2026-10-28.md](docs/campus-readiness-2026-10-28.md).

## Purpose

A self-service tool for UC San Diego faculty, staff and students to check a PDF for accessibility problems, apply the
fixes that can be made safely, and learn exactly what a person still has to do before publishing it. It is designed to
be honest: it never shows a PDF as accessible on the strength of automated checks alone.

The original scope was: upload PDFs, audit them, produce a remediated PDF, and present the results in a web app. It has
since grown OCR for scans, veraPDF verification, AI-assisted image descriptions, a manual checklist and re-validation of
revised files.

## Architecture

- **Next.js 15 / React 19 app** on Vercel. PDF parsing, auditing and remediation run in the browser (pdf.js, pdf-lib,
  tesseract.js); state lives in a Zustand store persisted to IndexedDB.
- **Server routes** (`app/api/*`) proxy to services that need credentials: TritonAI (OCR and image descriptions) and
  veraPDF. They share a guard (cross-site refusal, per-instance rate limit), request deadlines, JSON error codes and
  structured logs (`lib/server/`).
- **OCR worker** (`services/ocrmypdf-worker/`): optional FastAPI + OCRmyPDF service for PDF-native OCR, hosted outside
  Vercel.

## Processing pipeline (per file)

1. **Validate and queue**: PDF magic bytes, 50 MB, 10 files per batch, page limit. Files process one at a time; the
   queue runs from the `/app` layout so it continues while results are open.
2. **Parse and audit the original**: structure tree, MCID/ParentTree binding, text coverage by tags, metadata, links,
   forms, images and page geometry.
3. **OCR** when most pages are image-only: TritonAI per page, then local Tesseract. Coverage (pages processed of total) is
   recorded and shown.
4. **Remediate**: metadata (never invented: missing titles stay missing and are flagged; an assumed language is
   flagged), tab order, outline, heading levels, form tooltips only from labels that are clearly adjacent, OCR text
   layer for scans. Untagged documents are not given a synthetic tag tree; they stay `analysis-only`. PDF/UA is
   claimed only when the source's own structure is content-bound. Signed and encrypted PDFs are refused.
5. **Verify**: re-parse and re-audit the output; post it to veraPDF when configured and small enough, looping up to 3
   passes while the external result improves.
6. **Results**: one publish verdict naming the blocker, what was fixed automatically, what is left, the manual
   checklist (image descriptions with optional AI suggestions, table confirmations, structure tagging, OCR, remaining
   serious findings), the download, and a technical report for accessibility staff.

## Audit and scoring

Deterministic rules across document structure, headings, images, tables, lists, links, color, forms and metadata
(`lib/audit/rules/`). Severity-weighted score with guardrails: untagged and analysis-only output is capped at 40,
scanned documents lower, and repeated violations cost more than one. Checks that cannot run (such as color contrast)
are reported as not checked and block the top verdict.

## Honesty guarantees

- The top verdict is "Passed automated checks — a person still needs to review it", never "accessible".
- The checklist cannot reach 100% while a blocking problem has no item.
- The downloaded PDF does not claim PDF/UA, a title, an author or a language it was not given.
- Results that need work outside the app say so and point to campus help.

## Tests

Vitest unit and integration tests (`tests/`), a release gate of PDF regression fixtures (`fixtures/`,
`fixtures/regression/`), and a Playwright browser suite (`e2e-live/`) that runs against a local production build in CI
and against production after deploys.
