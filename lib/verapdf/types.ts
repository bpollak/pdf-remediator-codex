export interface VerapdfSummary {
  passedRules?: number;
  failedRules?: number;
  passedChecks?: number;
  failedChecks?: number;
}

export interface VerapdfResult {
  attempted: boolean;
  compliant?: boolean;
  profile?: string;
  statement?: string;
  summary?: VerapdfSummary;
  reason?: string;
}
