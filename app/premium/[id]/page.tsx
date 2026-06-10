import * as Sentry from "@sentry/nextjs";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { ContinuePremiumCheckoutButton } from "@/components/ContinuePremiumCheckoutButton";
import { OfferCard } from "@/components/OfferCard";
import { PremiumCheckoutConfirmer } from "@/components/PremiumCheckoutConfirmer";
import { PremiumSearchForm } from "@/components/PremiumSearchForm";
import { PremiumSearchRunner } from "@/components/PremiumSearchRunner";
import { PremiumSecondSearchOptions } from "@/components/PremiumSecondSearchOptions";
import { getReportIfAuthorized } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { ScoredInternshipOffer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PremiumSearchParams = {
  mockPaid?: string;
  paid?: string;
  payment?: string;
  refresh?: string;
  refill?: string;
  session_id?: string;
  token?: string;
};

type NoStrongSummary = {
  offersDetected: string;
  offersRejected: string;
  reasons: string;
  finalStrongMatches: string;
  strategy?: string;
};

function refreshHref(reportId: string, token?: string) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set("refresh", String(Date.now()));
  return `/premium/${reportId}?${params.toString()}`;
}

function refillHref(reportId: string, token?: string) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set("refill", "true");
  params.set("refresh", String(Date.now()));
  return `/premium/${reportId}?${params.toString()}`;
}

function retryWasUsed(errorMessage?: string) {
  return Boolean(errorMessage?.includes("[retry-used]") || errorMessage?.includes("[second-search-used]"));
}

function isNoStrongMatchesOutcome(errorMessage?: string) {
  return Boolean(errorMessage?.includes("[no-strong-matches]"));
}

function isClearlyUnrecoverablePremiumError(errorMessage?: string) {
  if (!errorMessage) return false;
  return /payment required|unauthorized|forbidden|missing report|missing premium criteria|premium criteria are required|token|report access/i.test(errorMessage);
}

function canRetryPremiumSearch(errorMessage?: string) {
  return !retryWasUsed(errorMessage) && !isClearlyUnrecoverablePremiumError(errorMessage);
}

function parseNoStrongSummary(errorMessage?: string): NoStrongSummary {
  const text = errorMessage ?? "";
  const strategy = text.match(/\[strategy:([^\]]+)\]/)?.[1]?.replace(/_/g, " ");
  return {
    offersDetected: text.match(/offers_detected=([^;]+)/)?.[1]?.trim() ?? "Not available",
    offersRejected: text.match(/offers_rejected=([^;]+)/)?.[1]?.trim() ?? "Not available",
    reasons: text.match(/main_rejection_reasons=([^;]+)/)?.[1]?.replace(/_/g, " ").trim() ?? "Quality filters",
    finalStrongMatches: text.match(/final_strong_matches=([^.;]+)/)?.[1]?.trim() ?? "0",
    strategy
  };
}

function capturePaidMissingInputs(reportId: string, isPaid: boolean, premiumSearchStatus: string, offerCount: number) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_missing_inputs", {
      reportId,
      isPaid,
      premiumSearchStatus,
      hasPremiumInputs: false,
      hasPremiumOffers: offerCount > 0,
      offerCount
    });
    Sentry.captureMessage("Premium paid report missing premium inputs", "warning");
  });
}

function captureSavedCriteriaNotUnlocked({
  reportId,
  isPaid,
  premiumSearchStatus,
  offerCount,
  hasPaidReturnParam,
  hasSessionId,
  allowCriteriaRefill
}: {
  reportId: string;
  isPaid: boolean;
  premiumSearchStatus: string;
  offerCount: number;
  hasPaidReturnParam: boolean;
  hasSessionId: boolean;
  allowCriteriaRefill: boolean;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_saved_criteria_not_unlocked", {
      reportId,
      isPaid,
      premiumSearchStatus,
      hasPremiumInputs: true,
      offerCount,
      hasPaidReturnParam,
      hasSessionId,
      allowCriteriaRefill
    });
    Sentry.captureMessage("Premium report has saved criteria but is not unlocked", "warning");
  });
}

function capturePremiumOffersWithoutUnlock({
  reportId,
  isPaid,
  premiumSearchStatus,
  offerCount,
  hasPremiumInputs,
  hasPaidReturnParam,
  hasSessionId,
  allowCriteriaRefill
}: {
  reportId: string;
  isPaid: boolean;
  premiumSearchStatus: string;
  offerCount: number;
  hasPremiumInputs: boolean;
  hasPaidReturnParam: boolean;
  hasSessionId: boolean;
  allowCriteriaRefill: boolean;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_offers_without_unlock", {
      reportId,
      isPaid,
      premiumSearchStatus,
      offerCount,
      hasPremiumInputs,
      hasPaidReturnParam,
      hasSessionId,
      allowCriteriaRefill
    });
    Sentry.captureMessage("Premium offers exist but report is not unlocked", "warning");
  });
}

function captureFailedPremiumReportWithOffers({
  reportId,
  isPaid,
  premiumSearchStatus,
  offerCount,
  hasPremiumInputs,
  hasRefillParam
}: {
  reportId: string;
  isPaid: boolean;
  premiumSearchStatus: string;
  offerCount: number;
  hasPremiumInputs: boolean;
  hasRefillParam: boolean;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_failed_with_stale_offers", {
      reportId,
      isPaid,
      premiumSearchStatus,
      offerCount,
      hasPremiumInputs,
      hasRefillParam
    });
    Sentry.captureMessage("Premium failed report has stale premium offers", "warning");
  });
}

function capturePremiumQuestionnaireRender({
  reportId,
  isPaid,
  unlocked,
  hasPremiumInputs,
  premiumSearchStatus,
  offerCount,
  hasRefillParam,
  hasPaidReturnParam,
  hasSessionId
}: {
  reportId: string;
  isPaid: boolean;
  unlocked: boolean;
  hasPremiumInputs: boolean;
  premiumSearchStatus: string;
  offerCount: number;
  hasRefillParam: boolean;
  hasPaidReturnParam: boolean;
  hasSessionId: boolean;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_questionnaire_render", {
      reportId,
      isPaid,
      unlocked,
      hasPremiumInputs,
      premiumSearchStatus,
      offerCount,
      hasRefillParam,
      hasPaidReturnParam,
      hasSessionId
    });
    Sentry.captureMessage("Premium questionnaire rendered", "warning");
  });
}

function PremiumOffers({ reportId, offers }: { reportId: string; offers: ScoredInternshipOffer[] }) {
  return (
    <section className="section">
      <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">Your curated premium internship leads</h1>
      <p className="mt-3 max-w-2xl text-ink/70">
        3 curated internship leads when available. If your criteria are narrow, close alternatives may be included and clearly labelled.
      </p>
      <div className="mt-8 grid gap-5">{offers.map((offer) => <OfferCard key={offer.id} offer={offer} reportId={reportId} premium />)}</div>
    </section>
  );
}

function NoStrongMatchesOutcome({ reportId, token, errorMessage, retryAvailable }: { reportId: string; token?: string; errorMessage?: string; retryAvailable: boolean }) {
  const summary = parseNoStrongSummary(errorMessage);
  const finalOutcome = !retryAvailable;

  return (
    <section className="section">
      <div className="max-w-3xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase text-signal">Premium search outcome</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Good news: you can stop scrolling.</h1>
        {finalOutcome ? (
          <div className="mt-4 space-y-3 text-lg leading-8 text-ink/75">
            <p>We checked your exact search and the closest alternatives.</p>
            <p>Nothing worth applying to is live right now.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-lg leading-8 text-ink/75">
            <p>Your perfect internship does not seem to be posted today.</p>
            <p>Better news: we found a few strong alternatives.</p>
          </div>
        )}
        <p className="mt-5 text-sm leading-6 text-ink/60">
          We filtered out weak, expired, unreachable, language-incompatible or irrelevant offers so you do not have to keep scrolling.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md bg-mist p-4"><p className="text-xs font-bold uppercase text-ink/45">Offers detected</p><p className="mt-2 text-2xl font-black text-ink">{summary.offersDetected}</p></div>
          <div className="rounded-md bg-mist p-4"><p className="text-xs font-bold uppercase text-ink/45">Offers filtered out</p><p className="mt-2 text-2xl font-black text-ink">{summary.offersRejected}</p></div>
          <div className="rounded-md bg-mist p-4"><p className="text-xs font-bold uppercase text-ink/45">Exact matches</p><p className="mt-2 text-2xl font-black text-ink">{summary.finalStrongMatches}</p></div>
          <div className="rounded-md bg-mist p-4"><p className="text-xs font-bold uppercase text-ink/45">Search stage</p><p className="mt-2 text-lg font-black text-ink">{finalOutcome ? "Final" : "Alternatives"}</p></div>
        </div>
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">Filtered out because: {summary.reasons}</p>
        {summary.strategy ? <p className="mt-3 rounded-md bg-ink/5 p-3 text-sm text-ink/70">Compromise used in the second search: {summary.strategy}</p> : null}
        {retryAvailable ? (
          <PremiumSecondSearchOptions reportId={reportId} accessToken={token} />
        ) : (
          <p className="mt-6 rounded-md bg-mist p-4 text-sm leading-6 text-ink/70">
            No regrets — the market has been checked. Come back when you want to try a broader search.
          </p>
        )}
        <p className="mt-4 text-xs font-semibold text-ink/45">Report id: {reportId}</p>
      </div>
    </section>
  );
}

export default async function PremiumPage({ params, searchParams }: { params: { id: string }; searchParams: PremiumSearchParams }) {
  noStore();

  const report = await getReportIfAuthorized(params.id, searchParams.token);
  if (!report) notFound();

  const stripeConfigured = Boolean(getStripeClient());
  const allowMockUnlock = searchParams.mockPaid === "true" && (!stripeConfigured || process.env.NODE_ENV !== "production");
  const unlocked = report.isPaid || allowMockUnlock;
  const paymentReturning = searchParams.paid === "true";
  const paymentCancelled = searchParams.payment === "cancelled";
  const allowCriteriaRefill = searchParams.refill === "true";
  const canShowCriteriaRefill = allowCriteriaRefill && (!unlocked || !report.premiumInputs);
  const premiumStatus = report.premiumSearchStatus ?? "not_started";
  const completedOffers = report.premiumOffers.slice(0, 3);
  const retryAvailable = premiumStatus === "failed" && report.premiumOffers.length === 0 && canRetryPremiumSearch(report.premiumSearchError);

  if (completedOffers.length > 0 && !unlocked) {
    capturePremiumOffersWithoutUnlock({
      reportId: report.id,
      isPaid: Boolean(report.isPaid),
      premiumSearchStatus: premiumStatus,
      offerCount: report.premiumOffers.length,
      hasPremiumInputs: Boolean(report.premiumInputs),
      hasPaidReturnParam: paymentReturning,
      hasSessionId: Boolean(searchParams.session_id),
      allowCriteriaRefill
    });
  }

  if (unlocked && premiumStatus === "completed" && completedOffers.length > 0) {
    return <PremiumOffers reportId={report.id} offers={completedOffers} />;
  }

  if (paymentReturning && !unlocked && searchParams.session_id) {
    return <PremiumCheckoutConfirmer reportId={report.id} accessToken={report.accessToken} sessionId={searchParams.session_id} />;
  }

  if (unlocked && !report.premiumInputs && !allowCriteriaRefill) {
    capturePaidMissingInputs(report.id, Boolean(report.isPaid), premiumStatus, report.premiumOffers.length);
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-amber-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-amber-600">Premium criteria missing</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Payment confirmed, but your criteria are missing</h1>
          <p className="mt-4 text-ink/70">
            Your payment is recorded, but we could not find the premium criteria linked to this report. Please refill the form once or contact support with this report id.
          </p>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">Report id: {report.id}</p>
          <a href={refillHref(report.id, report.accessToken)} className="mt-6 inline-flex button-primary">
            Refill the criteria
          </a>
        </div>
      </section>
    );
  }

  if (canShowCriteriaRefill) {
    capturePremiumQuestionnaireRender({
      reportId: report.id,
      isPaid: Boolean(report.isPaid),
      unlocked,
      hasPremiumInputs: Boolean(report.premiumInputs),
      premiumSearchStatus: premiumStatus,
      offerCount: report.premiumOffers.length,
      hasRefillParam: allowCriteriaRefill,
      hasPaidReturnParam: paymentReturning,
      hasSessionId: Boolean(searchParams.session_id)
    });

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

  if (!report.premiumInputs && !unlocked && !paymentReturning) {
    capturePremiumQuestionnaireRender({
      reportId: report.id,
      isPaid: Boolean(report.isPaid),
      unlocked,
      hasPremiumInputs: false,
      premiumSearchStatus: premiumStatus,
      offerCount: report.premiumOffers.length,
      hasRefillParam: allowCriteriaRefill,
      hasPaidReturnParam: paymentReturning,
      hasSessionId: Boolean(searchParams.session_id)
    });

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

  if (report.premiumInputs && !unlocked) {
    if (!searchParams.session_id) {
      captureSavedCriteriaNotUnlocked({
        reportId: report.id,
        isPaid: Boolean(report.isPaid),
        premiumSearchStatus: premiumStatus,
        offerCount: report.premiumOffers.length,
        hasPaidReturnParam: paymentReturning,
        hasSessionId: false,
        allowCriteriaRefill
      });
    }

    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Premium criteria saved</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Your premium criteria are saved, but payment is not confirmed yet.</h1>
          <p className="mt-4 text-ink/70">
            Your search criteria are linked to this report. If Stripe is still confirming the payment, refresh the status in a moment. You can also continue to payment again without refilling the questionnaire.
          </p>
          {paymentReturning ? (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Stripe sent you back, but this return URL is missing the checkout session id. Payment confirmation may still be pending.
            </p>
          ) : null}
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Report id: {report.id}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={refreshHref(report.id, report.accessToken)} className="inline-flex button-secondary">
              Refresh payment status
            </a>
            <ContinuePremiumCheckoutButton reportId={report.id} accessToken={report.accessToken} />
          </div>
        </div>
      </section>
    );
  }

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

  if (premiumStatus === "pending_payment") {
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Payment confirmation</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">{unlocked ? "Payment is confirmed, but the search is still pending" : "Waiting for payment confirmation"}</h1>
          <p className="mt-4 text-ink/70">
            {unlocked
              ? "Your payment is recorded, but the report status has not moved to ready yet. Refresh the status in a moment so the live search can continue."
              : "Your premium criteria are saved. We will start the live search only after Stripe confirms the payment securely."}
          </p>
          <a href={refreshHref(report.id, report.accessToken)} className="mt-6 inline-flex button-primary">
            Refresh payment status
          </a>
        </div>
      </section>
    );
  }

  if (premiumStatus === "failed") {
    if (isNoStrongMatchesOutcome(report.premiumSearchError)) {
      return <NoStrongMatchesOutcome reportId={report.id} token={report.accessToken} errorMessage={report.premiumSearchError} retryAvailable={retryAvailable} />;
    }

    if (unlocked && report.premiumOffers.length > 0) {
      captureFailedPremiumReportWithOffers({
        reportId: report.id,
        isPaid: Boolean(report.isPaid),
        premiumSearchStatus: premiumStatus,
        offerCount: report.premiumOffers.length,
        hasPremiumInputs: Boolean(report.premiumInputs),
        hasRefillParam: allowCriteriaRefill
      });
    }

    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-amber-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-amber-600">Premium search issue</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">The live search hit a technical issue</h1>
          <p className="mt-4 text-ink/70">
            Your payment is recorded, but this looks like a technical search problem rather than a market outcome. Please contact support with this report id if refreshing does not resolve it.
          </p>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">Report id: {report.id}</p>
          <a href={refreshHref(report.id, report.accessToken)} className="mt-6 inline-flex button-secondary">
            Refresh status
          </a>
        </div>
      </section>
    );
  }

  if (premiumStatus === "running") {
    return (
      <section className="section">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Your live search is running</h1>
          <p className="mt-4 text-ink/70">
            We are checking the status every few seconds. Refreshing the browser will not start another search.
          </p>
          <PremiumSearchRunner reportId={report.id} accessToken={report.accessToken} pollOnly autoStart={false} />
        </div>
      </section>
    );
  }

  if (premiumStatus === "ready_to_run" || premiumStatus === "not_started") {
    return (
      <section className="section">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase text-signal">Premium unlocked</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Your live search is ready to run</h1>
          <p className="mt-4 text-ink/70">
            We will use your saved premium criteria to search once for up to 3 curated leads. Refreshing the page will not start duplicate searches after the run begins.
          </p>
          <PremiumSearchRunner reportId={report.id} accessToken={report.accessToken} />
        </div>
      </section>
    );
  }

  if (premiumStatus === "completed") {
    return (
      <section className="section">
        <div className="max-w-2xl rounded-lg border border-amber-100 bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold uppercase text-amber-600">Premium search completed</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">No premium leads are saved on this report yet</h1>
          <p className="mt-4 text-ink/70">
            The report status says completed, but there are no premium leads attached. Please contact support with this report id so we can review the search state.
          </p>
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">Report id: {report.id}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase text-signal">Premium search</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Checking your report status</h1>
        <p className="mt-4 text-ink/70">Refresh this page in a moment if your premium report does not update automatically.</p>
        <a href={refreshHref(report.id, report.accessToken)} className="mt-6 inline-flex button-secondary">
          Refresh status
        </a>
      </div>
    </section>
  );
}
