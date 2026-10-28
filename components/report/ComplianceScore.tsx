import { HelpTip } from './HelpTip';

export function ComplianceScore({
  score,
  title,
  description
}: {
  score: number;
  title: string;
  description?: string;
}) {
  const color =
    score >= 100
      ? 'text-green-700'
      : score > 85
      ? 'text-[var(--ucsd-blue)]'
      : score >= 50
        ? 'text-amber-800'
        : 'text-[var(--ucsd-navy)]';

  const label =
    score >= 100
      ? 'All automated checks passed'
      : score >= 90
        ? 'Almost there — a few items need attention'
        : score >= 50
          ? 'Some issues still need to be fixed'
          : 'This PDF needs significant accessibility work';

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
        {title}{' '}
        <HelpTip label="accessibility score">
          This score shows what percentage of automated accessibility checks your PDF passes. A higher score means fewer issues for people using screen readers or other assistive tools. Even 100% only means the automated checks passed: a person still needs to review the PDF before publishing.
        </HelpTip>
      </p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{score}%</p>
      <p className={`text-sm font-medium ${color}`}>{label}</p>
      {description ? <p className="mt-1 text-sm text-[var(--ucsd-text)]">{description}</p> : null}
    </div>
  );
}
