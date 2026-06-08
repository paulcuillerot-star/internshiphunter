import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { webInternshipSearch } from "@/lib/ai/webInternshipSearch";
import { getProfile, getReportIfAuthorized, updateReportPremiumOffers, updateReportPremiumSearchStatus } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { CandidateProfile, InternshipSearchReport, PremiumSearchInputs, PremiumSearchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const retryUsedMarker = "[retry-used]";

function retryWasUsed(errorMessage?: string) {
  return Boolean(errorMessage?.includes(retryUsedMarker));
}

function premiumErrorType(errorMessage?: string) {
  if (!errorMessage) return "none";
  if (/zero valid|No language-compatible|no strong leads/i.test(errorMessage)) return "zero_results";
  if (/OpenAI|web_search|JSON|parse|timeout|network|rate/i.test(errorMessage)) return "recoverable_search_error";
  return "technical_error";
}

function sentryContext(report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, retry = false) {
  return {
    reportId: report.id,
    profileId: report.profileId,
    retry,
    status: report.premiumSearchStatus ?? "not_started",
    hasOffers: report.premiumOffers.length > 0,
    errorType: premiumErrorType(report.premiumSearchError),
    hasPremiumInputs: Boolean(premiumInputs),
    targetCountriesCount: premiumInputs?.targetCountries.length ?? 0,
    targetCitiesCount: premiumInputs?.targetCities.length ?? 0,
    languagesCount: premiumInputs?.languagesSpoken.length ?? 0,
    premiumSearchStatus: report.premiumSearchStatus ?? "not_started",
    offerCount: report.premiumOffers.length
  };
}

function capturePremiumSearchMessage(message: string, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, level: "info" | "warning" | "error" = "info", retry = false) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setTag("retry", String(retry));
    scope.setContext("premium_search", sentryContext(report, premiumInputs, retry));
    Sentry.captureMessage(message, level);
  });
}

function capturePremiumSearchException(error: unknown, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, retry = false) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setTag("retry", String(retry));
    scope.setContext("premium_search", sentryContext(report, premiumInputs, retry));
    Sentry.captureException(error);
  });
}

function mergePremiumProfile(profile: CandidateProfile, premiumInputs: PremiumSearchInputs): CandidateProfile {
  return {
    ...profile,
    targetCountries: premiumInputs.targetCountries,
    targetCities: premiumInputs.targetCities,
    languagesSpoken: premiumInputs.languagesSpoken,
    internshipStartDate: premiumInputs.internshipStartDate,
    internshipDuration: premiumInputs.internshipDuration,
    companiesAlreadyAppliedTo: premiumInputs.companiesAlreadyAppliedTo,
    thingsToAvoid: premiumInputs.thingsToAvoid,
    idealInternshipDescription: premiumInputs.idealInternshipDescription,
    cvText: premiumInputs.profileSummary || profile.cvText
  };
}

export async function POST(request: Request) {
  const { reportId, token, retry } = (await request.json()) as { reportId?: string; token?: string; retry?: boolean };
  const retryRequested = Boolean(retry);
  if (!reportId) return NextResponse.json({ error: "Missing reportId." }, { status: 400 });

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });

  const premiumInputs = report.premiumInputs;
  const status: PremiumSearchStatus = report.premiumSearchStatus ?? "not_started";
  const allowMockPaid = !getStripeClient() || process.env.NODE_ENV !== "production";

  if (!report.isPaid && !allowMockPaid) {
    return NextResponse.json({ error: "Payment is required before running premium search." }, { status: 403 });
  }

  if (!premiumInputs) {
    return NextResponse.json({ error: "Premium criteria are required before running premium search." }, { status: 400 });
  }

  if (status === "completed" && report.premiumOffers.length > 0) {
    capturePremiumSearchMessage("Premium search blocked because already completed", report, premiumInputs, "warning", retryRequested);
    return NextResponse.json({ status: "completed", offerCount: report.premiumOffers.length });
  }

  if (status === "running") {
    capturePremiumSearchMessage("Premium search blocked because already running", report, premiumInputs, "warning", retryRequested);
    return NextResponse.json({ status: "running", offerCount: report.premiumOffers.length });
  }

  if (status === "failed") {
    if (!retryRequested) {
      capturePremiumSearchMessage("Premium search failed state returned with retry available", report, premiumInputs, "warning");
      return NextResponse.json(
        {
          error: "Premium search did not deliver strong leads. You can retry once with broader criteria at no extra cost.",
          retryAvailable: !retryWasUsed(report.premiumSearchError)
        },
        { status: 409 }
      );
    }

    if (report.premiumOffers.length > 0 || retryWasUsed(report.premiumSearchError)) {
      capturePremiumSearchMessage("Premium search retry blocked because retry was already used", report, premiumInputs, "warning", true);
      return NextResponse.json({ error: "Premium search retry was already used. Please contact support with this report id." }, { status: 409 });
    }
  }

  try {
    await updateReportPremiumSearchStatus(report.id, "running");
    capturePremiumSearchMessage("Premium search started", { ...report, premiumSearchStatus: "running" }, premiumInputs, "info", retryRequested);

    const profile = await getProfile(report.profileId);
    const premiumProfile = mergePremiumProfile(profile, premiumInputs);
    const result = await webInternshipSearch(premiumProfile, premiumProfile.cvText, { retryMode: retryRequested });
    const offers = result.offers.slice(0, 3).map((offer) => ({ ...offer, isPremium: true }));

    if (!offers.length) {
      throw new Error("Premium live search returned zero valid opportunities.");
    }

    await updateReportPremiumOffers(report.id, offers);
    capturePremiumSearchMessage("Premium search completed", { ...report, premiumOffers: offers, premiumSearchStatus: "completed" }, premiumInputs, "info", retryRequested);
    return NextResponse.json({ status: "completed", offerCount: offers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown premium search error";
    const storedMessage = retryRequested ? `${retryUsedMarker} ${message}` : message;
    await updateReportPremiumSearchStatus(report.id, "failed", storedMessage).catch(() => undefined);
    capturePremiumSearchMessage("Premium search failed", { ...report, premiumSearchStatus: "failed", premiumSearchError: storedMessage }, premiumInputs, "error", retryRequested);
    capturePremiumSearchException(error, { ...report, premiumSearchError: storedMessage }, premiumInputs, retryRequested);
    return NextResponse.json(
      {
        error: retryRequested
          ? "Premium search still could not find strong leads after retry. Please contact support with this report id."
          : "Premium search could not find strong leads with these criteria. You can retry once with broader criteria at no extra cost.",
        retryAvailable: !retryRequested
      },
      { status: 500 }
    );
  }
}
