import { notFound } from "next/navigation";
import { OfferCard } from "@/components/OfferCard";
import { PremiumSearchForm } from "@/components/PremiumSearchForm";
import { PremiumSearchRunner } from "@/components/PremiumSearchRunner";
import { getReportIfAuthorized } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PremiumSearchParams = {
  mockPaid?: string;
  paid?: string;
  payment?: string;
  refresh?: string;
  token?: string;
};

function refreshHref(reportId: string, token?: string) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set("paid", "true");
  params.set("refresh", String(Date.now()));
  return `/premium/${reportId}?${params.toString()}`;
}

function retryWasUsed(errorMessage?: string) {
  return Boolean(errorMessage?.includes("[retry-used]"));
}

function premiumErrorType(errorMessage?: string) {
  if (!errorMessage) return "none";
  if (/zero valid|No language-compatible|no strong leads/i.test(errorMessage)) return "zero_results";
  if (/OpenAI|web_search|JSON|parse|timeout|network|rate/i.test(errorMessage)) return "recoverable_search_error";
  return "technical_error";
}

function canRetryPremiumSearch(errorMessage?: string) {
  const errorType = premiumErrorType(errorMessage);
  return !retryWasUsed(errorMessage) && (errorType === "zero_results" || errorType === "recoverable_search_error");
}

export default async function PremiumPage({ params, searchParams }: { params: { id: string }; searchParams: PremiumSearchParams }) {
  const report = await getReportIfAuthorized(params.id, searchParams.token);
  if (!report) notFound();

  const stripeConfigured = Boolean(getStripeClient());
  const allowMockUnlock = searchParams.mockPaid === "true" && (!stripeConfigured || process.env.NODE_ENV !== "production");
  const unlocked = report.isPaid || allowMockUnlock;
  const paymentReturning = searchParams.paid === "true";
  const paymentCancelled = searchParams.payment === "cancelled";
  const premiumStatus = report.premiumSearchStatus ?? "not_started";
  const completedOffers = premiumStatus === "completed" ? report.premiumOffers.slice(0, 3) : [];
  const retryAvailable = premiumStatus === "failed" && completedOffers.length === 0 && canRetryPremiumSearch(report.premiumSearchError);

  if (paymentReturning && !unlocked) {
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Payment confirmed</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Unlocking your report...</h1>
          <p className="mt-4 text-ink/70">
            Stripe sent you back successfully. We are waiting for the secure payment confirmation to finish updating your report.
          </p>
          <a href={refreshHref(report.id, report.accessToken)} className="mt-6 inline-flex button-primary">
            Refresh unlock status
          </a>
        </div>
      </section>
    );
  }

  if (!report.premiumInputs || !unlocked) {
    return (
      <section className="section">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase text-signal">Premium search</p>
          <h1 className="mt-3 text-4xl font-black text-ink">Find the 3 best internships for you right now</h1>
          <p className="mt-4 max-w-2xl text-ink/70">
            Add a few details so Internship Hunter can search for opportunities that fit your profile, locations, languages and timing.
          </p>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-ink/55">
            If your criteria are narrow, we may include close alternatives and explain what was broadened.
          </p>
          <PremiumSearchForm reportId={report.id} accessToken={report.accessToken} initialInputs={report.premiumInputs} paymentCancelled={paymentCancelled} />
        </div>
      </section>
    );
  }

  if (premiumStatus === "completed" && completedOffers.length > 0) {
    return (
      <section className="section">
        <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Your curated premium internship leads</h1>
        <p className="mt-3 max-w-2xl text-ink/70">
          3 curated internship leads when available. If your criteria are narrow, close alternatives may be included and clearly labelled.
        </p>
        <div className="mt-8 grid gap-5">{completedOffers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={report.id} premium />)}</div>
      </section>
    );
  }

  if (premiumStatus === "failed") {
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-amber-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-amber-600">Premium search needs a broader pass</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">We could not find strong leads with those exact criteria</h1>
          <p className="mt-4 text-ink/70">
            Your payment is recorded. Language compatibility and quality filters stayed strict, so the first search did not deliver a strong enough result.
          </p>
          {retryAvailable ? (
            <>
              <p className="mt-4 text-ink/70">
                You can broaden your search once and retry your premium search at no extra cost. We may broaden nearby locations or adjacent roles, but we will not broaden language compatibility or include weak filler.
              </p>
              <PremiumSearchRunner reportId={report.id} accessToken={report.accessToken} retry autoStart={false} />
            </>
          ) : (
            <>
              <p className="mt-4 text-ink/70">
                This search cannot be retried automatically. Please contact support with this report id so we can review it manually.
              </p>
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">Report id: {report.id}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Your live search is ready to run</h1>
        <p className="mt-4 text-ink/70">
          We will use your saved premium criteria to search once for up to 3 curated leads. Refreshing the page will not start duplicate searches.
        </p>
        <PremiumSearchRunner reportId={report.id} accessToken={report.accessToken} />
      </div>
    </section>
  );
}
