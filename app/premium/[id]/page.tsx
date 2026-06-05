import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferCard } from "@/components/OfferCard";
import { getReport } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import { CheckoutButton } from "./CheckoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PremiumPage({ params, searchParams }: { params: { id: string }; searchParams: { mockPaid?: string; paid?: string } }) {
  const report = await getReport(params.id);
  if (!report) notFound();

  const stripeConfigured = Boolean(getStripeClient());
  const allowMockUnlock = searchParams.mockPaid === "true" && (!stripeConfigured || process.env.NODE_ENV !== "production");
  const unlocked = report.isPaid || allowMockUnlock;
  const paymentReturning = searchParams.paid === "true";
  const premiumOffers = report.premiumOffers.slice(0, 3);

  if (unlocked) {
    return (
      <section className="section">
        <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Your curated premium internship leads</h1>
        <p className="mt-3 max-w-2xl text-ink/70">
          3 curated internship leads when available. If your criteria are narrow, close alternatives may be included and clearly labelled.
        </p>
        <div className="mt-8 grid gap-5">{premiumOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} premium />)}</div>
      </section>
    );
  }

  if (paymentReturning) {
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Payment confirmed</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Unlocking your report...</h1>
          <p className="mt-4 text-ink/70">
            Stripe sent you back successfully. We are waiting for the secure payment confirmation to finish updating your report.
          </p>
          <Link href={`/premium/${report.id}?paid=true`} className="mt-6 inline-flex button-primary">
            Refresh unlock status
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="max-w-2xl rounded-lg border border-line bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase text-signal">Premium report</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Unlock personalized live search</h1>
        <p className="mt-4 text-ink/70">Premium will run live AI research later for up to 3 curated internship leads, with CV-based matching, exact target cities, language filtering, timing, exclusions and labelled close alternatives when needed.</p>
        <CheckoutButton reportId={report.id} />
      </div>
    </section>
  );
}
