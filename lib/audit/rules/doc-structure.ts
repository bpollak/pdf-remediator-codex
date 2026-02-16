import type { AuditRule } from '../types';

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
  }
];
