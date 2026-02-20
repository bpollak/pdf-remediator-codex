import type { ParsedPDF } from '@/lib/pdf/types';

export type Severity = 'critical' | 'major' | 'minor';
export type Category =
  | 'Document Structure'
  | 'Headings & Structure'
  | 'Images & Non-Text Content'
  | 'Tables'
  | 'Lists'
  | 'Links & Navigation'
  | 'Color & Visual'
  | 'Forms'
  | 'Metadata & Navigation';

export const ALL_CATEGORIES: Category[] = [
  'Document Structure',
  'Headings & Structure',
  'Images & Non-Text Content',
  'Tables',
  'Lists',
  'Links & Navigation',
  'Color & Visual',
  'Forms',
  'Metadata & Navigation',
];

export interface AuditFinding {
  ruleId: string;
  category: Category;
  severity: Severity;
  description: string;
  wcagCriterion: string;
  location: { page?: number; element?: string };
  recommendation: string;
  autoFixable: boolean;
}

export interface AuditContext {
  parsed: ParsedPDF;
}

export interface AuditRule {
  id: string;
  evaluate: (context: AuditContext) => AuditFinding[];
}

export interface AuditResult {
  findings: AuditFinding[];
  score: number;
}
