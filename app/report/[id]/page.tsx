import { notFound } from "next/navigation";
import Link from "next/link";
import { LockedOfferCard } from "@/components/LockedOfferCard";
import { OfferCard } from "@/components/OfferCard";
import { PricingCTA } from "@/components/PricingCTA";
import { SearchSummary } from "@/components/SearchSummary";
import { getProfile, getReport } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const report = await getReport(params.id);
  if (!report) notFound();
  const profile = await getProfile(report.profileId);

  return (
    <section className="section">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-signal">Free report</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Your matched internship search track</h1>
          <p className="mt-3 max-w-2xl text-ink/70">These are weekly examples from your closest matching track. They are cached examples, not live-verified offers.</p>
        </div>
        <Link href={`/premium/${report.id}`} className="inline-flex items-center justify-center rounded-md bg-signal px-5 py-3 text-sm font-bold text-white shadow-[0_18px_38px_rgba(15,118,110,0.26)] transition hover:bg-emerald-700">
          Unlock my personalized live search
        </Link>
      </div>

      <div className="mt-8"><SearchSummary profile={profile} /></div>

      {report.matchedSearch ? (
        <section className="mt-6 overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-soft ring-1 ring-emerald-50">
          <div className="h-1.5 bg-gradient-to-r from-signal via-emerald-400 to-lime-300" />
          <div className="p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal ring-1 ring-emerald-200">Matched track</p>
                <h2 className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">{report.matchedSearch.bucket.displayTitle}</h2>
                <p className="mt-2 text-sm font-semibold text-ink/60">{report.matchedSearch.category.name}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-left md:min-w-56">
                <p className="text-xs font-bold uppercase tracking-wide text-signal">Closest market</p>
                <p className="mt-1 text-2xl font-black text-ink">{report.matchedSearch.region}</p>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-line bg-mist/70 p-4">
              <p className="text-sm font-bold text-ink">Why this track fits</p>
              <p className="mt-2 text-sm leading-6 text-ink/70">{report.matchedSearch.explanation}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-8 grid gap-5">
        {report.freeOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} />)}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <div className="grid gap-5">
          {report.premiumOffers.map((offer, index) => <LockedOfferCard key={offer.id} index={index + 1} />)}
        </div>
        <PricingCTA reportId={report.id} />
      </div>
    </section>
  );
}
