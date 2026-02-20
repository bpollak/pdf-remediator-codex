export function ComplianceScore({ score }: { score: number }) {
  const color =
    score > 85
      ? 'text-[var(--ucsd-blue)]'
      : score >= 50
        ? 'text-[var(--ucsd-gold)]'
        : 'text-[var(--ucsd-navy)]';

  const label = score > 85 ? 'Excellent' : score >= 50 ? 'Needs Work' : 'Poor';

  return (
    <div>
      <p className={`text-3xl font-bold ${color}`}>{score}% compliant</p>
      <p className={`text-sm font-medium ${color}`}>{label}</p>
    </div>
  );
}
