# Accessible PDF Application Summary

## 1) Purpose

This application is a browser-first PDF accessibility workflow for:

1. Uploading PDF files.
2. Auditing each file against deterministic WCAG 2.1 AA-oriented rules.
3. Automatically generating a remediated PDF.
4. Comparing original vs remediated files side-by-side.
5. Reviewing before/after scores and findings in one place.

The landing page states that manual review is still recommended for full WCAG compliance.

## 2) Original Prompt Baseline (Initial Scope)

The initial scope was:

1. Upload PDFs.
2. Run automated accessibility audit checks.
3. Create a remediated PDF.
4. Present results in a usable web app experience.

## 3) Current End-to-End Flow

For each uploaded file, the app now performs:

1. **Validation and queuing**
   - Accepts up to 10 files per batch.
   - Validates file type and PDF magic bytes.
   - Enforces a 50 MB per-file size limit.
2. **Parsing original uploaded bytes**
   - Parses structure, metadata, links, forms, outlines, tags, and text items.
3. **Scanned-document detection**
   - Detects likely image-only/scanned documents using text-density heuristics.
4. **OCR attempt for scanned documents**
   - Primary path: `/api/ocr` to upstream OCR service.
   - Fallback path: local browser Tesseract OCR when upstream OCR is unavailable.
5. **Original audit**
   - Runs audit on the original uploaded document parse (not OCR-augmented parse).
6. **Remediation**
   - Builds remediated output with semantic and metadata improvements.
   - If local OCR fallback was used, embeds an invisible OCR text layer into remediated PDF.
7. **Post-remediation parse and audit**
   - Re-parses remediated bytes and computes post-remediation score/findings.
8. **Compare + reports**
   - Side-by-side previews with score, file size, and SHA-256 hash per pane.
   - Original and remediated findings/reports shown together on compare page.

## 4) Major Functional Areas

### Upload and state management

1. Uses a client-side Zustand store for per-file lifecycle state.
2. Stores immutable `uploadedBytes` to preserve exact original source.
3. Tracks status: `queued -> parsing -> ocr -> auditing -> remediating -> remediated` (or `error`).

### OCR subsystem

1. `isLikelyScannedPdf` heuristics identify scan-heavy documents.
2. OCR API route (`/api/ocr`) proxies to external OCR backend with timeout/auth support.
3. Local OCR fallback runs Tesseract in browser for a capped page count.
4. Local OCR fallback now persists searchable text into remediated PDF via invisible text layer embedding.

### Audit subsystem

1. Deterministic ruleset across categories:
   - Document structure
   - Headings
   - Images
   - Tables
   - Lists
   - Links/navigation
   - Color (placeholder rules)
   - Forms
   - Metadata/navigation
2. Severity-weighted scoring model.
3. Additional score caps for high-risk structure issues:
   - Untagged document cap.
   - Scanned/image-only detection cap.

### Remediation subsystem

1. Preserves original page dimensions when source bytes are available.
2. Injects semantic manifest/metadata used for post-remediation parse fidelity.
3. Handles unsupported glyphs safely when building remediated output.
4. Adds invisible OCR text layer when local OCR fallback data is available.

### Compare and report UX

1. Side-by-side iframed PDF preview.
2. Clear per-pane download actions:
   - Original PDF
   - Remediated PDF
3. Per-pane integrity and diagnostics metadata:
   - Compliance score
   - File size
   - SHA-256 hash
4. Unified before/after findings and summary cards on compare page.

## 5) Enhancements Added Beyond Original Prompt

The following enhancements were implemented after the baseline scope:

1. Automatic queue processing for uploaded files.
2. Stabilized PDF.js worker and production bundling behavior.
3. In-browser side-by-side compare previews.
4. Fixes for blank/remediated preview rendering issues.
5. Improved file action links and post-processing UX.
6. Correct post-remediation audit based on re-parsed remediated bytes.
7. Robust handling for unsupported glyphs in PDF generation.
8. Display of both original and remediated compliance scores.
9. Persistence of remediation analysis for more accurate post-remediation scoring.
10. Unified report details into compare view (single before/after workflow).
11. UC San Diego branding and UI refinements.
12. Corrected original-preview source so it uses uploaded bytes.
13. Separated original-audit source from OCR/remediation source path.
14. Added scanned-document rule and low-score enforcement for scan-heavy originals.
15. Added fixture-based regression tests for scanned documents and remediation outcomes.
16. Added per-pane SHA-256 and size metadata to verify file identity in UI.
17. Persisted local OCR fallback into final remediated PDF (invisible text layer).
18. Added regression coverage for invisible OCR text-layer behavior.

## 6) Scoring Behavior (Current)

1. Starts from weighted penalties based on finding severity.
2. Applies guardrails:
   - Untagged (`DOC-002`) can cap score to a lower ceiling.
   - Scanned/image-only (`DOC-004`) can cap score to a very low ceiling.
3. Result is an integer percent score shown in reports and compare panes.

Practical effect:

1. Scanned originals should score low until OCR/structure remediation is applied.
2. Remediated documents should generally improve and remove key structure findings.

## 7) OCR Configuration and Deployment Notes

Required/optional environment support in the Next.js app:

1. `OCR_SERVICE_URL` (OCR backend URL).
2. `OCR_SERVICE_TOKEN` (optional bearer token).
3. `OCR_SERVICE_API_KEY` (optional API key header).
4. `OCR_TIMEOUT_MS` (optional timeout tuning).

Included backend template:

1. `services/ocrmypdf-worker/` (FastAPI + OCRmyPDF worker).
2. Supports authenticated `POST /ocr` PDF processing.

Operational note:

1. Hosting upload limits (for example serverless body size constraints) can affect large OCR requests.

## 8) Test and Quality Coverage

The project includes targeted tests for:

1. OCR scan detection heuristics.
2. Audit engine scoring and scanned-document penalty expectations.
3. Uploaded-byte immutability across processing updates.
4. Remediation builder behavior (page size preservation, manifest embedding, OCR text-layer embedding).
5. Public PDF fixture regressions (scanned detection, low original score, remediated non-regression).

## 9) Current User-Visible Guarantees

The app now explicitly supports these guarantees:

1. Original pane represents uploaded source bytes.
2. Remediated pane represents generated output bytes.
3. Both panes provide direct download links.
4. Compare pane surfaces per-file hash/size for byte-level verification.
5. Scanned originals are identified and scored appropriately low.
6. OCR fallback output can be persisted into remediated PDFs for searchability.

