export function ComplianceScore({ score }: { score: number }) {
  const color =
    score > 85
      ? 'text-[var(--ucsd-blue)]'
      : score >= 50
        ? 'text-[var(--ucsd-gold)]'
        : 'text-[var(--ucsd-navy)]';

  const label = score > 85 ? 'Strong automated signals' : score >= 50 ? 'Needs manual remediation' : 'High accessibility risk';

  return (
    <div>
      <p className={`text-3xl font-bold ${color}`}>{score}% Automated Check Score</p>
      <p className={`text-sm font-medium ${color}`}>{label}</p>
    </div>
  );
}
