export function ScoreBadge({ label, value }: { label: string; value: number }) {
  const isStrong = value >= 80;
  const tone = isStrong
    ? "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[0_14px_30px_rgba(16,185,129,0.16)]"
    : value >= 70
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-line bg-mist text-ink";

  return (
    <div className={`inline-flex items-center gap-3 rounded-lg border px-4 py-3 ${tone}`}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">{isStrong ? "Strong match" : label}</p>
        <p className="mt-0.5 text-2xl font-black leading-none">{value}<span className="text-sm font-bold opacity-70">/100</span></p>
      </div>
    </div>
  );
}
