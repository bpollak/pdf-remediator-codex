import { allRules } from './rules';
import type { AuditResult } from './types';
import type { ParsedPDF } from '@/lib/pdf/types';
import { computeComplianceScore } from '@/lib/utils/scoring';

export function runAudit(parsed: ParsedPDF): AuditResult {
  const findings = allRules.flatMap((rule) => rule.evaluate({ parsed }));
  const baseScore = computeComplianceScore(allRules.length, findings);
  const score = parsed.textItems.length === 0 ? Math.min(baseScore, 35) : baseScore;
  return { findings, score };
}
