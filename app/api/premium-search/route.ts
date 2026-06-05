import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { webInternshipSearch } from "@/lib/ai/webInternshipSearch";
import { getProfile, getReportIfAuthorized, updateReportPremiumOffers, updateReportPremiumSearchStatus } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { CandidateProfile, InternshipSearchReport, PremiumSearchInputs, PremiumSearchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sentryContext(report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs) {
  return {
    reportId: report.id,
    profileId: report.profileId,
    hasPremiumInputs: Boolean(premiumInputs),
    targetCountriesCount: premiumInputs?.targetCountries.length ?? 0,
    targetCitiesCount: premiumInputs?.targetCities.length ?? 0,
    languagesCount: premiumInputs?.languagesSpoken.length ?? 0,
    premiumSearchStatus: report.premiumSearchStatus ?? "not_started",
    offerCount: report.premiumOffers.length
  };
}

function capturePremiumSearchMessage(message: string, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, level: "info" | "warning" | "error" = "info") {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setContext("premium_search", sentryContext(report, premiumInputs));
    Sentry.captureMessage(message, level);
  });
}

function capturePremiumSearchException(error: unknown, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setContext("premium_search", sentryContext(report, premiumInputs));
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
  const { reportId, token } = (await request.json()) as { reportId?: string; token?: string };
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
    capturePremiumSearchMessage("Premium search blocked because already completed", report, premiumInputs, "warning");
    return NextResponse.json({ status: "completed", offerCount: report.premiumOffers.length });
  }

  if (status === "running") {
    capturePremiumSearchMessage("Premium search blocked because already running", report, premiumInputs, "warning");
    return NextResponse.json({ status: "running", offerCount: report.premiumOffers.length });
  }

  if (status === "failed") {
    capturePremiumSearchMessage("Premium search blocked because already failed", report, premiumInputs, "warning");
    return NextResponse.json({ error: "Premium search already failed. Please contact support." }, { status: 409 });
  }

  try {
    await updateReportPremiumSearchStatus(report.id, "running");
    capturePremiumSearchMessage("Premium search started", { ...report, premiumSearchStatus: "running" }, premiumInputs);

    const profile = await getProfile(report.profileId);
    const premiumProfile = mergePremiumProfile(profile, premiumInputs);
    const result = await webInternshipSearch(premiumProfile, premiumProfile.cvText);
    const offers = result.offers.slice(0, 3).map((offer) => ({ ...offer, isPremium: true }));

    if (!offers.length) {
      throw new Error("Premium live search returned zero valid opportunities.");
    }

    await updateReportPremiumOffers(report.id, offers);
    capturePremiumSearchMessage("Premium search completed", { ...report, premiumOffers: offers, premiumSearchStatus: "completed" }, premiumInputs);
    return NextResponse.json({ status: "completed", offerCount: offers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown premium search error";
    await updateReportPremiumSearchStatus(report.id, "failed", message).catch(() => undefined);
    capturePremiumSearchMessage("Premium search failed", { ...report, premiumSearchStatus: "failed", premiumSearchError: message }, premiumInputs, "error");
    capturePremiumSearchException(error, report, premiumInputs);
    return NextResponse.json({ error: "Premium search failed. Please contact support." }, { status: 500 });
  }
}
