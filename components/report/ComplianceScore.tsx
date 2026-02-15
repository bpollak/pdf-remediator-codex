export function ComplianceScore({ score }: { score: number }) {
  const state = score > 85 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
  return <p className={`text-3xl font-bold ${state}`}>{score}% compliant</p>;
}
