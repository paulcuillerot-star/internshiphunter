import { notFound } from "next/navigation";
import Link from "next/link";
import { LockedOfferCard } from "@/components/LockedOfferCard";
import { OfferCard } from "@/components/OfferCard";
import { PricingCTA } from "@/components/PricingCTA";
import { SearchSummary } from "@/components/SearchSummary";
import { getProfile, getReport } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ReportPage({ params }: { params: { id: string } }) {
  const report = getReport(params.id);
  if (!report) notFound();
  const profile = getProfile(report.profileId);

  return (
    <section className="section">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-signal">Free report</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Your matched internship search track</h1>
          <p className="mt-3 max-w-2xl text-ink/70">
            These are weekly examples from your closest matching track. They are cached examples, not live-verified offers.
          </p>
        </div>
        <Link href={`/premium/${report.id}`} className="button-primary">Unlock personalized live search</Link>
      </div>

      <div className="mt-8"><SearchSummary profile={profile} /></div>

      {report.matchedSearch ? (
        <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Matched track</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">{report.matchedSearch.bucket.displayTitle}</h2>
          <div className="mt-3 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
            <p><span className="font-semibold text-ink">Category:</span> {report.matchedSearch.category.name}</p>
            <p><span className="font-semibold text-ink">Closest market:</span> {report.matchedSearch.region}</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink/70">{report.matchedSearch.explanation}</p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-5">
        {report.freeOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} />)}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <div className="grid gap-5">{report.premiumOffers.map((offer, index) => <LockedOfferCard key={offer.id} index={index + 1} />)}</div>
        <PricingCTA reportId={report.id} />
      </div>
    </section>
  );
}
