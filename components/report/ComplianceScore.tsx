export function ComplianceScore({ score }: { score: number }) {
  const state = score > 85 ? 'text-[var(--ucsd-blue)]' : score >= 50 ? 'text-[var(--ucsd-gold)]' : 'text-[var(--ucsd-navy)]';
  return <p className={`text-3xl font-bold ${state}`}>{score}% compliant</p>;
}
