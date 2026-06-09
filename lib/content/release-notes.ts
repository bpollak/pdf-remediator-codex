export type ReleaseNote = {
  id: string;
  versionLabel: string;
  deployedOn: string;
  summary?: string;
  highlights: readonly string[];
};

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-06-09-ux-clarity-and-alt-text-reliability',
    versionLabel: 'Release 2026.06.09',
    deployedOn: 'June 9, 2026',
    summary:
      'Clearer publish-readiness guidance, friendlier error and processing feedback, and more reliable TritonAI alt-text suggestions.',
    highlights: [
      'Added an "Is this PDF ready to publish?" status banner to the results page with plain-language reasons, an analysis-only explanation, and a scanned-text notice when OCR could not add searchable text.',
      'Added duration expectations and a long-running notice to upload file cards, plus a keep-this-tab-open warning while files are still processing.',
      'Changed error messages for oversized OCR uploads, password-protected PDFs, and unreadable PDFs to explain what to do next.',
      'Fixed TritonAI alt-text suggestions failing for informative images by giving reasoning models a much larger token budget and retrying once when the budget is exhausted.',
      'Added per-model failure detail to alt-text diagnostics so production issues can be diagnosed without server log access.',
      'Replaced MCID/ParentTree jargon in next steps with plain language and added a help tip explaining decorative images.',
      'Corrected the landing page privacy description and linked the 2-minute quick start from the home page.',
      'Added a Playwright post-deploy regression suite that runs against the live production site.',
      'Clarified that manual-edit drafts are a browser worksheet and are not embedded in the downloaded PDF, with steps for applying them in Acrobat or the source document.',
      'Added "Download PDF with my descriptions": saved image descriptions are embedded into the PDF as content-bound Figure tags with alt text, and decorative images are marked as artifacts. Images that cannot be tagged safely are listed for follow-up in Acrobat.',
      'Re-uploading an embedded PDF now credits existing Figure alt text and artifact-marked images, so resolved image findings clear on re-validation.'
    ]
  },
  {
    id: '2026-05-22-tritonai-ocr-primary',
    versionLabel: 'Release 2026.05.22',
    deployedOn: 'May 22, 2026',
    summary: 'Scanned PDF OCR can now use TritonAI as the primary OCR path before falling back to other options.',
    highlights: [
      'Added a TritonAI OCR route for the on-prem api-lightonocr-1b model.',
      'Added OCR and alt-text model fallbacks so production can recover when a configured TritonAI model rejects the key or returns unusable output.',
      'Changed scanned-PDF processing to try TritonAI OCR before the optional PDF-native OCR service and browser fallback.',
      'Reuse the existing invisible text-layer remediation so TritonAI OCR output can become searchable PDF text.',
      'Documented the OCR_LITELLM_* Vercel variables and optional fallback model lists needed to configure OCR separately from alt-text suggestions.'
    ]
  },
  {
    id: '2026-05-22-minimal-results-page',
    versionLabel: 'Release 2026.05.22',
    deployedOn: 'May 22, 2026',
    summary: 'The results page was rebuilt around only the actions a reviewer needs to finish the PDF.',
    highlights: [
      'Reduced the results screen to download, manual edits, and revised-PDF upload.',
      'Removed technical status panels, evidence downloads, score comparisons, and detailed validation counts from the main results path.',
      'Added a plain-language manual edit list for image descriptions, table confirmation, and custom reviewer tasks.',
      'Kept completion percentage visible without requiring users to understand the internal workflow.'
    ]
  },
  {
    id: '2026-05-19-tritonai-alt-text-suggestions',
    versionLabel: 'Release 2026.05.19',
    deployedOn: 'May 19, 2026',
    summary: 'Alt-text drafting can now use TritonAI to suggest reviewer-approved descriptions from PDF image crops.',
    highlights: [
      'Added a TritonAI-powered alt-text suggestion route using the campus LiteLLM gateway configuration.',
      'Added Suggest with TritonAI actions in the Alt Text Workspace so reviewers can generate, inspect, and apply draft descriptions.',
      'Rendered cropped PDF image regions for the model so recommendations are based on the actual PDF content plus nearby text context.',
      'Added clearer TritonAI upstream diagnostics so production configuration or model compatibility issues can be resolved quickly.',
      'Kept generated alt text as a draft only; reviewers still apply or edit suggestions before the worksheet is considered ready.'
    ]
  },
  {
    id: '2026-05-19-extra-automation-passes',
    versionLabel: 'Release 2026.05.19',
    deployedOn: 'May 19, 2026',
    summary: 'Additional safe remediation passes now automate more navigation and form-label work without weakening structure guardrails.',
    highlights: [
      'Added bookmark generation from confident detected headings when long documents do not already include outlines.',
      'Added conservative form tooltip remediation that fills missing labels from nearby visible text or clear field names.',
      'Added safe structure repairs so PDFs with trustworthy bound structure consistently set page tab order and normalize skipped heading levels.',
      'Kept analysis-only guardrails in place for PDFs where full content-bound semantic tagging still cannot be proven automatically.'
    ]
  },
  {
    id: '2026-05-18-manual-completion-tracking',
    versionLabel: 'Release 2026.05.18',
    deployedOn: 'May 18, 2026',
    summary: 'Manual remediation work is easier to track from the compare workflow, and iterative remediation reports are clearer.',
    highlights: [
      'Added a Manual completion panel with a live percentage based on alt-text coverage, reviewed tables, and custom manual items.',
      'Added persisted custom manual items so reviewers can track unautomated work such as reading order, form labels, metadata, or tag repairs.',
      'Kept pending manual work tied to the existing revised-PDF validation flow so users can apply fixes externally and then re-check the updated file.',
      'Changed second-pass remediation results to say when no additional automated fixes were found instead of leaving the improvement summary blank.',
      'Changed checker/report artifact results so they do not present as successful publishable remediation output.'
    ]
  },
  {
    id: '2026-03-10-build-stability-fixes',
    versionLabel: 'Release 2026.03.10',
    deployedOn: 'March 10, 2026',
    summary: 'Build stability issues were fixed and the remediation workflow now reports real user progress more accurately.',
    highlights: [
      'Fixed report generation helpers so optional veraPDF summary data no longer trips TypeScript in manual next steps or revision-delta comparisons.',
      'Changed the veraPDF API route max duration export to a static literal so Next.js recognizes the route config during production builds.',
      'Changed the remediation workflow so Step 1 completes only after the user actually downloads the remediated PDF instead of merely landing on the compare screen.',
      'Kept every remediation step openable even when the user has not completed prior steps, so the workflow recommends order without hard-gating navigation.',
      'Retitled browser-based planning steps so the UI distinguishes in-app preparation from the actual Acrobat or PAC edits that still happen outside the app.',
      'Updated the workflow and state panels to prioritize download first, then in-browser review, before alt-text, structure, re-validation, and publish guidance.'
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
