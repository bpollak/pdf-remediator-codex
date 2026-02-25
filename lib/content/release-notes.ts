export type ReleaseNote = {
  id: string;
  versionLabel: string;
  deployedOn: string;
  summary?: string;
  highlights: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-02-25-guardrails-and-stability',
    versionLabel: 'Release 2026.02.25',
    deployedOn: 'February 25, 2026',
    summary: 'Scoring and remediation outputs are now more conservative and easier to trust.',
    highlights: [
      'Added score guardrails so critical structural risks cannot be reported as fully accessible.',
      'Added explicit remediation mode labeling: content-bound vs analysis-only.',
      'Moved to compact immutable remediation metadata to reduce second-pass drift.',
      'Hardened table and image heuristics to reduce synthetic structures and better flag true image elements.',
      'Expanded regression coverage with PDF Accessibility agent fixture checks.'
    ]
  }
];
