import Link from "next/link";
import { LockedOfferCard } from "@/components/LockedOfferCard";
import { OfferCard } from "@/components/OfferCard";
import { PricingCTA } from "@/components/PricingCTA";
import { SearchSummary } from "@/components/SearchSummary";
import { getProfile, getReport } from "@/lib/store";

export default function ReportPage({ params }: { params: { id: string } }) {
  const report = getReport(params.id);
  if (!report) return <section className="section"><h1 className="text-3xl font-bold text-ink">Report not found</h1><Link href="/apply" className="mt-6 button-primary">Create a new search</Link></section>;
  const profile = getProfile(report.profileId);
  return <section className="section"><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold uppercase text-signal">Free report</p><h1 className="mt-3 text-4xl font-bold text-ink">Your first 2 golden offers</h1><p className="mt-3 max-w-2xl text-ink/70">These are the best free matches from the current search. Premium offers stay locked until checkout.</p></div><Link href={`/premium/${report.id}`} className="button-primary">Unlock 5 more offers for €9.90</Link></div><div className="mt-8"><SearchSummary profile={profile} /></div><div className="mt-8 grid gap-5">{report.freeOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} />)}</div><div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.75fr]"><div className="grid gap-5">{report.premiumOffers.map((offer, index) => <LockedOfferCard key={offer.id} index={index + 1} />)}</div><PricingCTA reportId={report.id} /></div></section>;
}
