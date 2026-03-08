export type ReleaseNote = {
  id: string;
  versionLabel: string;
  deployedOn: string;
  summary?: string;
  highlights: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
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
