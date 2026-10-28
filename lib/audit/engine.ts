import { allRules } from './rules';
import type { AuditResult } from './types';
import type { ParsedPDF } from '@/lib/pdf/types';
import { computeComplianceScore } from '@/lib/utils/scoring';

export function runAudit(parsed: ParsedPDF): AuditResult {
  const context = { parsed };
  const notChecked: string[] = [];
  const findings = allRules.flatMap((rule) => {
    if (rule.canEvaluate && !rule.canEvaluate(context)) {
      notChecked.push(rule.id);
      return [];
    }
    return rule.evaluate(context);
  });
  const score = computeComplianceScore(findings);
  return { findings, score, notChecked };
}
