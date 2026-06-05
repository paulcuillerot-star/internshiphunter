import { notFound } from "next/navigation";
import Link from "next/link";
import { LockedOfferCard } from "@/components/LockedOfferCard";
import { OfferCard } from "@/components/OfferCard";
import { PricingCTA } from "@/components/PricingCTA";
import { SearchSummary } from "@/components/SearchSummary";
import { getProfile, getReportIfAuthorized } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReportPage({ params, searchParams }: { params: { id: string }; searchParams: { token?: string } }) {
  const report = await getReportIfAuthorized(params.id, searchParams.token);
  if (!report) notFound();
  const profile = await getProfile(report.profileId);
  const visibleFreeOffers = report.freeOffers.slice(0, 1);
  const tokenParam = report.accessToken ? `?token=${encodeURIComponent(report.accessToken)}` : "";

  return (
    <section className="section">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-signal">Free report</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">A top opportunity for your profile</h1>
          <p className="mt-3 max-w-2xl text-ink/70">Here is one high-signal internship opportunity selected from our reviewed Europe cache. Premium search unlocks CV-based matching, exact cities, languages, timing, exclusions and application angles.</p>
        </div>
        <Link href={`/premium/${report.id}${tokenParam}`} className="inline-flex items-center justify-center rounded-md bg-signal px-5 py-3 text-sm font-bold text-white shadow-[0_18px_38px_rgba(15,118,110,0.26)] transition hover:bg-emerald-700">
          Unlock my personalized live search
        </Link>
      </div>

      <div className="mt-8"><SearchSummary profile={profile} /></div>

      <div className="mt-8 grid gap-5">
        {visibleFreeOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} />)}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <div className="grid gap-5">
          {report.premiumOffers.map((offer, index) => <LockedOfferCard key={offer.id} index={index + 1} />)}
        </div>
        <PricingCTA reportId={report.id} accessToken={report.accessToken} />
      </div>
    </section>
  );
}
