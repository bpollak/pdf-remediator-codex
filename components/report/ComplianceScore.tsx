import { HelpTip } from './HelpTip';

function gradeLabel(score: number): { letter: string; bg: string } {
  if (score >= 100) return { letter: 'A', bg: 'bg-green-100 text-green-800' };
  if (score >= 90) return { letter: 'A-', bg: 'bg-green-100 text-green-800' };
  if (score >= 80) return { letter: 'B', bg: 'bg-blue-100 text-blue-800' };
  if (score >= 70) return { letter: 'C', bg: 'bg-amber-100 text-amber-800' };
  if (score >= 50) return { letter: 'D', bg: 'bg-orange-100 text-orange-800' };
  return { letter: 'F', bg: 'bg-red-100 text-red-800' };
}

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
        ? 'text-[var(--ucsd-gold)]'
        : 'text-[var(--ucsd-navy)]';

  const label =
    score >= 100
      ? 'All automated checks passed'
      : score >= 90
        ? 'Almost there — a few items need attention'
        : score >= 50
          ? 'Some issues still need to be fixed'
          : 'This PDF needs significant accessibility work';

  const grade = gradeLabel(score);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">
        {title}
        <HelpTip label="accessibility score">
          This score shows what percentage of automated accessibility checks your PDF passes. A higher score means fewer issues for people using screen readers or other assistive tools. 100% means all automated checks passed, but a final manual review is still recommended before publishing.
        </HelpTip>
      </p>
      <div className="mt-1 flex items-center gap-3">
        <p className={`text-3xl font-bold ${color}`}>{score}%</p>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold ${grade.bg}`}>
          {grade.letter}
        </span>
      </div>
      <p className={`text-sm font-medium ${color}`}>{label}</p>
      {description ? <p className="mt-1 text-sm text-[var(--ucsd-text)]">{description}</p> : null}
    </div>
  );
}
