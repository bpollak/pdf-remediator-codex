import type { AuditRule } from '../types';

export const formRules: AuditRule[] = [
  {
    id: 'FRM-001',
    evaluate: ({ parsed }) =>
      parsed.forms
        .filter((form) => !form.label)
        .map((form) => ({
          ruleId: 'FRM-001',
          category: 'Forms',
          severity: 'major',
          description: `Form field ${form.name} is missing label metadata.`,
          wcagCriterion: '3.3.2 Labels or Instructions',
          location: { element: form.name },
          recommendation: 'Set form tooltip (/TU) or label association.',
          autoFixable: true
        }))
  },
  {
    id: 'FRM-002',
    evaluate: ({ parsed }) =>
      parsed.forms.some((form) => form.required && !form.label)
        ? [{
            ruleId: 'FRM-002',
            category: 'Forms',
            severity: 'minor',
            description: 'Required field indication may be unclear.',
            wcagCriterion: '1.3.1 Info and Relationships',
            location: {},
            recommendation: 'Programmatically mark required fields.',
            autoFixable: true
          }]
        : []
  }
];
