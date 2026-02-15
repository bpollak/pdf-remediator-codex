import type { AuditRule } from '../types';

export const metadataRules: AuditRule[] = [
  {
    id: 'META-001',
    evaluate: ({ parsed }) =>
      parsed.metadata.Subject
        ? []
        : [{
            ruleId: 'META-001',
            category: 'Metadata & Navigation',
            severity: 'minor',
            description: 'Document subject metadata is missing.',
            wcagCriterion: '2.4.2 Page Titled',
            location: {},
            recommendation: 'Set document subject metadata.',
            autoFixable: true
          }]
  },
  {
    id: 'META-002',
    evaluate: ({ parsed }) =>
      parsed.hasStructTree
        ? []
        : [{
            ruleId: 'META-002',
            category: 'Metadata & Navigation',
            severity: 'major',
            description: 'Cannot confirm structure-based tab order.',
            wcagCriterion: '2.4.3 Focus Order',
            location: {},
            recommendation: 'Set page tabs to follow structure order (/Tabs /S).',
            autoFixable: true
          }]
  }
];
