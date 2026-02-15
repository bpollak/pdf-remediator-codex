import type { AuditRule } from '../types';

const suspiciousAlt = /^(image|img|scan|photo)[-_\d\s]*\.(png|jpg|jpeg|gif)$/i;

export const imageRules: AuditRule[] = [
  {
    id: 'IMG-001',
    evaluate: ({ parsed }) =>
      parsed.images
        .filter((image) => !image.decorative && !image.alt)
        .map((image) => ({
          ruleId: 'IMG-001',
          category: 'Images & Non-Text Content',
          severity: 'critical',
          description: 'Image is missing alt text.',
          wcagCriterion: '1.1.1 Non-text Content',
          location: { page: image.page, element: image.id },
          recommendation: 'Provide meaningful alt text.',
          autoFixable: false
        }))
  },
  {
    id: 'IMG-002',
    evaluate: ({ parsed }) =>
      parsed.images
        .filter((image) => image.alt && suspiciousAlt.test(image.alt))
        .map((image) => ({
          ruleId: 'IMG-002',
          category: 'Images & Non-Text Content',
          severity: 'major',
          description: 'Image alt text appears to be filename-like.',
          wcagCriterion: '1.1.1 Non-text Content',
          location: { page: image.page, element: image.id },
          recommendation: 'Replace filename-like alt text with descriptive text.',
          autoFixable: false
        }))
  }
];
