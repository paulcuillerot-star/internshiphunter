import Link from "next/link";

export function PricingCTA({ reportId }: { reportId?: string }) {
  const href = reportId ? `/premium/${reportId}` : "/apply";
  return <div className="rounded-lg border border-line bg-ink p-6 text-white shadow-soft"><p className="text-sm font-semibold uppercase text-white/60">Premium unlock</p><h3 className="mt-2 text-2xl font-bold">5 additional offers for €9.90</h3><p className="mt-2 text-sm leading-6 text-white/75">Unlock deeper matches with interview probability, LinkedIn outreach and cover letter hooks.</p><Link href={href} className="mt-5 inline-flex rounded-md bg-white px-5 py-3 text-sm font-semibold text-ink">Unlock 5 more offers</Link></div>;
}
