import { allRules } from './rules';
import type { AuditResult } from './types';
import type { ParsedPDF } from '@/lib/pdf/types';
import { ANALYSIS_ONLY_SCORE_CAP, computeComplianceScore } from '@/lib/utils/scoring';

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
  const findingScore = computeComplianceScore(findings);
  // Output the remediator could only analyse (its manifest says so) keeps
  // the visible content untagged; its score cannot rise above that of an
  // untagged file just because metadata was filled in.
  const score =
    parsed.remediationMode === 'analysis-only' ? Math.min(findingScore, ANALYSIS_ONLY_SCORE_CAP) : findingScore;
  return { findings, score, notChecked };
}
