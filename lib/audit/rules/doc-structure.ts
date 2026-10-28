import type { AuditRule } from '../types';
import { isLikelyScannedPdf } from '@/lib/ocr/detection';

/** Below this share of page text reachable through tags, DOC-007 fails. */
export const MIN_TEXT_TAG_COVERAGE = 0.9;
/** Below this share, most of the text is invisible to assistive technology. */
export const CRITICAL_TEXT_TAG_COVERAGE = 0.5;
/** Too little text to judge coverage (e.g. a cover page with a logo). */
const MIN_COVERAGE_SAMPLE_CHARS = 50;

export const docStructureRules: AuditRule[] = [
  {
    id: 'DOC-001',
    evaluate: ({ parsed }) =>
      parsed.metadata['pdfuaid:part']
        ? []
        : [{
            ruleId: 'DOC-001',
            category: 'Document Structure',
            severity: 'major',
            description: 'Missing PDF/UA metadata identifier.',
            wcagCriterion: '4.1.2 Name, Role, Value',
            location: {},
            recommendation: 'Include PDF/UA identifier metadata on remediation output.',
            autoFixable: true
          }]
  },
  {
    id: 'DOC-002',
    evaluate: ({ parsed }) =>
      parsed.hasStructTree
        ? []
        : [{
            ruleId: 'DOC-002',
            category: 'Document Structure',
            severity: 'critical',
            description: 'Document is untagged (no StructTreeRoot found).',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: {},
            recommendation: 'Generate a complete semantic tag tree.',
            autoFixable: true
          }]
  },
  {
    id: 'DOC-003',
    evaluate: ({ parsed }) =>
      parsed.language
        ? []
        : [{
            ruleId: 'DOC-003',
            category: 'Document Structure',
            severity: 'major',
            description: 'Document language is not set.',
            wcagCriterion: '3.1.1 Language of Page',
            location: {},
            recommendation: 'Set /Lang in the catalog.',
            autoFixable: true
          }]
  },
  {
    id: 'DOC-004',
    evaluate: ({ parsed }) =>
      isLikelyScannedPdf(parsed)
        ? [{
            ruleId: 'DOC-004',
            category: 'Document Structure',
            severity: 'critical',
            description: 'Document appears image-only/scanned with insufficient extractable text.',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: {},
            recommendation: 'Run OCR and add semantic structure before publishing.',
            autoFixable: true
          }]
        : []
  },
  {
    id: 'DOC-005',
    evaluate: ({ parsed }) => {
      const summary = parsed.structureBinding;
      if (!parsed.hasStructTree || !summary) return [];
      if (summary.hasContentBinding) return [];

      if (summary.structElemCount === 0) {
        return [{
          ruleId: 'DOC-005',
          category: 'Document Structure',
          severity: 'critical',
          description: 'Tag tree is empty: StructTreeRoot exists but contains no structure elements.',
          wcagCriterion: '1.3.1 Info and Relationships',
          location: { element: 'StructTreeRoot' },
          recommendation: 'Tag the document content; an empty tag tree gives assistive technology nothing to read.',
          autoFixable: false
        }];
      }

      return [{
        ruleId: 'DOC-005',
        category: 'Document Structure',
        severity: 'critical',
        description: 'Tag tree exists but is not bound to marked content (/MCID or ParentTree entries).',
        wcagCriterion: '1.3.1 Info and Relationships',
        location: { element: 'StructTreeRoot' },
        recommendation: 'Bind structure tags to content items before claiming tagged accessibility output.',
        autoFixable: false
      }];
    }
  },
  {
    id: 'DOC-006',
    evaluate: ({ parsed }) =>
      parsed.languageAssumed && parsed.language
        ? [{
            ruleId: 'DOC-006',
            category: 'Document Structure',
            severity: 'major',
            description: `Document language was set automatically to "${parsed.language}" because the original had none; it has not been confirmed.`,
            wcagCriterion: '3.1.1 Language of Page',
            location: {},
            recommendation: 'Confirm the document language in its properties and correct it if it is wrong.',
            autoFixable: false
          }]
        : []
  },
  {
    id: 'DOC-007',
    evaluate: ({ parsed }) => {
      const coverage = parsed.textTagCoverage;
      // Unbound or empty trees are already reported by DOC-005.
      if (!coverage || !parsed.structureBinding?.hasContentBinding) return [];
      const total = coverage.taggedChars + coverage.untaggedChars;
      if (total < MIN_COVERAGE_SAMPLE_CHARS) return [];
      const share = coverage.taggedChars / total;
      if (share >= MIN_TEXT_TAG_COVERAGE) return [];

      return [{
        ruleId: 'DOC-007',
        category: 'Document Structure',
        severity: share < CRITICAL_TEXT_TAG_COVERAGE ? 'critical' : 'major',
        description: `Only ${Math.floor(share * 100)}% of the page text is connected to the tag tree; the rest is skipped by screen readers.`,
        wcagCriterion: '1.3.1 Info and Relationships',
        location: { element: 'StructTreeRoot' },
        recommendation: 'Tag the untagged text (or mark it as an artifact if it is decorative) so every piece of content is in the tag tree.',
        autoFixable: false
      }];
    }
  }
];
