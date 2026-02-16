import { allRules } from './rules';
import type { AuditResult } from './types';
import type { ParsedPDF } from '@/lib/pdf/types';
import { computeComplianceScore } from '@/lib/utils/scoring';

export function runAudit(parsed: ParsedPDF): AuditResult {
  const findings = allRules.flatMap((rule) => rule.evaluate({ parsed }));
  const score = computeComplianceScore(allRules.length, findings);
  return { findings, score };
}
