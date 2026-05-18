export function ScoreBadge({ label, value }: { label: string; value: number }) {
  const tone = value >= 85 ? "bg-signal text-white" : value >= 70 ? "bg-amber-100 text-amber-900" : "bg-line text-ink";
  return <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold ${tone}`}><span>{label}</span><span>{value}/100</span></div>;
}
