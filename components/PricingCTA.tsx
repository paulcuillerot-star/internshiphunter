import Link from "next/link";

export function PricingCTA({ reportId, accessToken }: { reportId?: string; accessToken?: string }) {
  const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const href = reportId ? `/premium/${reportId}${tokenParam}` : "/apply";

  return (
    <div className="rounded-lg border border-emerald-400/30 bg-ink p-6 text-white shadow-soft">
      <p className="inline-flex rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-200">Premium unlock</p>
      <h3 className="mt-4 text-3xl font-bold">Unlock my personalized live search</h3>
      <p className="mt-3 text-sm leading-6 text-white/75">
        For €9.90, premium will search for up to 3 curated internship leads around your CV, target cities, languages, companies already applied to and timing.
      </p>
      <p className="mt-3 text-sm leading-6 text-white/65">
        If your criteria are narrow, close alternatives may be included and clearly labelled.
      </p>
      <Link href={href} className="mt-5 inline-flex rounded-md bg-emerald-400 px-5 py-3 text-sm font-bold text-ink shadow-[0_16px_35px_rgba(52,211,153,0.28)] transition hover:bg-emerald-300">
        Unlock for €9.90
      </Link>
    </div>
  );
}
