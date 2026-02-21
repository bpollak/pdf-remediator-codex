# UX Review Report (UCSD Staff Persona)
Date: 2026-02-21

## Scope Reviewed
- Home page
- Upload and queue flow
- Compare/results flow
- Verification and next-step messaging
- About documentation screen

## Findings

### P0-1: Entry copy is too technical for first-time staff users
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/app/page.tsx:8`
- `/Users/bpollak/Documents/accessible-pdf-codex/app/page.tsx:11`
- `/Users/bpollak/Documents/accessible-pdf-codex/app/app/page.tsx:11`

Impact:
- Users must parse terms like "WCAG 2.1 AA", "remediate", and "compliance" before they understand what to do.

Recommendation:
- Replace first-touch copy with plain actions and outcomes.

Suggested copy:
- "Upload your PDF. We check accessibility issues and generate an improved version."
- "You will get: (1) improved PDF, (2) what was fixed, (3) what still needs manual edits."

### P0-2: Results still present multiple scoring systems without one clear decision summary
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/ComplianceScore.tsx:13`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/SummaryDashboard.tsx:49`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/VerificationPanel.tsx:76`

Impact:
- Staff users can see strong internal progress but still not know "Can I publish this now?"

Recommendation:
- Add one "Publishing readiness" banner above all panels with 3 states:
  - `Ready for manual final review`
  - `Needs manual fixes before publishing`
  - `Verification unavailable; manual checker required`

Suggested copy:
- "Status: Needs manual fixes before publishing. Follow the 3 actions below."

### P0-3: Processing status labels expose internal pipeline names instead of user-readable steps
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/upload/FileCard.tsx:11`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/upload/QueueProcessor.tsx:36`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/upload/QueueProcessor.tsx:74`

Impact:
- Terms like "parsing", "auditing", and "remediating" are opaque; users cannot tell what is happening.

Recommendation:
- Map internal statuses to plain labels:
  - `parsing` -> "Reading your PDF"
  - `ocr` -> "Making scanned text searchable"
  - `auditing` -> "Checking accessibility issues"
  - `remediating` -> "Applying fixes"
  - `remediated` -> "Ready: review results"

### P1-1: Primary outcome action ("Download remediated PDF") is not prominent enough
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/preview/SideBySide.tsx:107`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/upload/FileCard.tsx:43`

Impact:
- Users may stop at "View results" and miss the main deliverable.

Recommendation:
- Add a persistent primary button near top of compare page:
  - "Download remediated PDF"
- Keep "Open in browser" as secondary action.

### P1-2: Issue cards lead with technical identifiers instead of user tasks
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/IssueCard.tsx:13`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/IssueCard.tsx:18`

Impact:
- `DOC-001 · 4.1.2 Name, Role, Value` is not meaningful to staff users.

Recommendation:
- Lead with an action sentence, tuck technical IDs into a details row.

Suggested structure:
- Title: "Add document language"
- Body: "Why this matters" + "How to fix"
- Footnote: "Technical reference: DOC-003, WCAG 3.1.1"

### P1-3: Next-step guidance still includes tool-specific language without role-based alternatives
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/lib/report/next-steps.ts:130`
- `/Users/bpollak/Documents/accessible-pdf-codex/lib/report/next-steps.ts:156`

Impact:
- "Fix them in your source file or tags panel" assumes users know editing tools.

Recommendation:
- Add role-aware choice text:
  - "If you edit PDFs in Acrobat, use Tags and Accessibility Checker."
  - "If you only have the source document (Word/PowerPoint), update there and export PDF again."

### P1-4: veraPDF metrics are informative but not translated into "what should I do"
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/VerificationPanel.tsx:76`
- `/Users/bpollak/Documents/accessible-pdf-codex/components/report/VerificationPanel.tsx:91`

Impact:
- Counts alone do not tell users how to prioritize fixes.

Recommendation:
- Add one sentence under metrics:
  - "Start with failed rules first. Then resolve remaining failed checks."
- Link this sentence to the first relevant item in "What To Do Next."

### P2-1: Technical integrity details (SHA-256) add noise for primary staff workflow
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/components/preview/SideBySide.tsx:98`

Impact:
- Most users do not need checksums during routine remediation.

Recommendation:
- Move SHA-256 into a collapsible "Advanced details" section.

### P2-2: About page is comprehensive but not task-oriented for first use
Evidence:
- `/Users/bpollak/Documents/accessible-pdf-codex/app/about/page.tsx:15`
- `/Users/bpollak/Documents/accessible-pdf-codex/app/about/page.tsx:50`

Impact:
- First-time users are more likely to need a short quick-start than full architecture details.

Recommendation:
- Add a "2-minute quick start" card at top:
  1. Upload PDF
  2. Download improved PDF
  3. Follow manual checklist
  4. Re-upload for final check

## Implementation Order (Fastest Value)
1. Plain-language status labels in file queue.
2. Top-level "Publishing readiness" banner in compare view.
3. Primary "Download remediated PDF" button.
4. Issue-card rewrite to action-first wording.
5. Role-based manual-fix guidance.

## Automated Accessibility Scan Addendum
Source report:
- `/Users/bpollak/Documents/accessible-pdf-codex/docs/ux/a11y-scan/summary-2026-02-21.md`

Additional recommendations from scan:
1. Ensure each route has a single clear `<h1>` heading.
2. Re-run axe after major copy/layout updates to prevent regressions on structural rules.
3. Keep manual assistive-tech checks as release criteria for dynamic compare flows.
