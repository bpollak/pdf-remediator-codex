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
      ? 'Current automated baseline is complete'
      : score >= 50
        ? 'Additional remediation is still required'
        : 'High remediation effort likely';

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ucsd-text)]">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{score}%</p>
      <p className={`text-sm font-medium ${color}`}>{label}</p>
      {description ? <p className="mt-1 text-sm text-[var(--ucsd-text)]">{description}</p> : null}
    </div>
  );
}
