export type ReleaseNote = {
  id: string;
  versionLabel: string;
  deployedOn: string;
  summary?: string;
  highlights: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-03-10-build-stability-fixes',
    versionLabel: 'Release 2026.03.10',
    deployedOn: 'March 10, 2026',
    summary: 'Build-blocking veraPDF and report type-safety issues were fixed so deployments can complete cleanly again.',
    highlights: [
      'Fixed report generation helpers so optional veraPDF summary data no longer trips TypeScript in manual next steps or revision-delta comparisons.',
      'Changed the veraPDF API route max duration export to a static literal so Next.js recognizes the route config during production builds.'
    ]
  },
  {
    id: '2026-03-09-ocr-reliability-and-reporting',
    versionLabel: 'Release 2026.03.09',
    deployedOn: 'March 9, 2026',
    summary: 'Scanned-PDF OCR is more reliable and the uploaded-file report now explains when OCR affected remediation.',
    highlights: [
      'Aligned browser OCR timeouts with the longer server OCR processing window so large scans are less likely to fail early.',
      'Added post-OCR validation so a returned PDF only counts as OCR-applied when it actually exposes usable searchable text.',
      'Fell back to local browser OCR when upstream OCR output cannot be parsed or does not improve text extraction.',
      'Added original-report messaging so OCR activity is visible even though the uploaded-file baseline still shows the source PDF.',
      'Removed redundant explanatory copy from the accessibility status banner so the status chips carry the detail.',
      'Stopped draft-edit persistence from rewriting large PDF assets on every keystroke so alt-text entry stays responsive.',
      'Removed the redundant red accessibility status banner from the report screens so the workflow-state panels remain the primary status surface.',
      'Hardened veraPDF integration with Render wake-up handling, API retries, and clearer verdict fallback when the service returns incomplete metadata.'
    ]
  },
  {
    id: '2026-03-08-upload-queue-management',
    versionLabel: 'Release 2026.03.08',
    deployedOn: 'March 8, 2026',
    summary: 'The Upload PDF screen is easier to clean up after repeat runs, failed attempts, and revised validations.',
    highlights: [
      'Moved the newest uploaded PDFs to the top of the Upload PDF list.',
      'Added Remove from list actions for completed remediated PDFs so saved reviews can be cleared from this browser.',
      'Added Remove from list actions for failed uploads marked Needs attention.',
      'Removing a saved upload also clears linked revised uploads from the local Upload PDF list to avoid orphaned entries.',
      'Hardened PDF byte handling so scanned uploads stay reusable across parse, OCR, remediation, and verification steps.'
    ]
  },
  {
    id: '2026-02-25-guardrails-and-stability',
    versionLabel: 'Release 2026.02.25',
    deployedOn: 'February 25, 2026',
    summary: 'Scoring and remediation outputs are now more conservative and easier to trust.',
    highlights: [
      'Added score guardrails so critical structural risks cannot be reported as fully accessible.',
      'Added explicit remediation mode labeling: content-bound vs analysis-only.',
      'Added source-type assessment to flag checker/report artifacts vs source content PDFs.',
      'Added Structural Integrity, Alt Text, and Manual Structure workspaces on compare view.',
      'Added QA Evidence Pack export for audit-ready before/after reporting.',
      'Moved to compact immutable remediation metadata to reduce second-pass drift.',
      'Hardened table and image heuristics to reduce synthetic structures and better flag true image elements.',
      'Expanded regression coverage with PDF Accessibility agent fixture checks.'
    ]
  }
];
