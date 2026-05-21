import Link from "next/link";

export function PricingCTA({ reportId }: { reportId?: string }) {
  const href = reportId ? `/premium/${reportId}` : "/apply";

  return (
    <div className="rounded-lg border border-line bg-ink p-6 text-white shadow-soft">
      <p className="text-sm font-semibold uppercase text-white/60">Premium unlock</p>
      <h3 className="mt-2 text-2xl font-bold">Personalized live AI search</h3>
      <p className="mt-2 text-sm leading-6 text-white/75">
        Unlock exact target countries and cities, CV-based matching, language filtering, companies already applied to,
        application angles and outreach support.
      </p>
      <Link href={href} className="mt-5 inline-flex rounded-md bg-white px-5 py-3 text-sm font-semibold text-ink">
        Unlock personalized search
      </Link>
    </div>
  );
}
