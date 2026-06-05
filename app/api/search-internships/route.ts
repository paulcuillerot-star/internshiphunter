import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { mockOffers } from "@/lib/mockData";
import { matchSearchBucket } from "@/lib/searchBuckets";
import { getBestCachedOpportunityForProfile, getWeeklyFreeUsageReportId, hasSupabaseConfig, saveLog, saveProfile, saveReport, saveWeeklyFreeUsage } from "@/lib/store";
import type { CandidateProfile, InternshipSearchReport } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function splitList(value: FormDataEntryValue | null) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function listField(formData: FormData, name: string) {
  const values = formData.getAll(name).flatMap((value) => splitList(value));
  return Array.from(new Set(values));
}
function makeId() { return crypto.randomUUID(); }
function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function emailDomain(email: string) {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : "unknown";
}
function currentWeekKey() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const day = Math.floor((Number(now) - Number(start)) / 86400000);
  const week = Math.ceil((day + start.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function captureValidationFailure(reason: string, profile: CandidateProfile) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "free-match");
    scope.setTag("route", "api/search-internships");
    scope.setTag("reason", reason);
    scope.setTag("emailDomain", emailDomain(profile.email));
    scope.setContext("free_match_validation", {
      reason,
      desiredRolesCount: profile.desiredRoles.length,
      targetCountriesCount: profile.targetCountries.length
    });
    Sentry.captureMessage("Free match validation failed", "warning");
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const cv = formData.get("cv");
  const cvFileName = cv instanceof File && cv.size > 0 ? cv.name : "Not provided in free flow";
  const now = new Date().toISOString();
  const selectedTracks = listField(formData, "desiredRoles");
  const selectedMarkets = ["Europe"];
  const profile: CandidateProfile = { id: makeId(), firstName: String(formData.get("firstName") ?? ""), email: normalizeEmail(String(formData.get("email") ?? "")), cvFileUrl: cvFileName, cvText: cv instanceof File && cv.size > 0 ? `Mock CV extraction for ${cvFileName}. Real PDF parsing will be added after storage is configured.` : "CV not provided in the free flow. Premium search will use the CV later.", targetCountries: selectedMarkets, targetCities: listField(formData, "targetCities"), targetIndustries: [], desiredRoles: selectedTracks, internshipStartDate: String(formData.get("internshipStartDate") ?? ""), internshipDuration: String(formData.get("internshipDuration") ?? ""), languagesSpoken: listField(formData, "languagesSpoken"), minimumCompensation: "", companiesAlreadyAppliedTo: listField(formData, "companiesAlreadyAppliedTo"), idealInternshipDescription: "", thingsToAvoid: String(formData.get("thingsToAvoid") ?? ""), createdAt: now };
  if (!profile.email || !profile.targetCountries.length || !profile.desiredRoles.length) {
    captureValidationFailure("missing_required_fields", profile);
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (profile.desiredRoles.length > 2) {
    captureValidationFailure("too_many_internship_tracks", profile);
    return NextResponse.json({ error: "Select no more than 2 internship tracks." }, { status: 400 });
  }

  const reportId = makeId();

  try {
    await saveProfile(profile);

    if (hasSupabaseConfig()) {
      const existingReportId = await getWeeklyFreeUsageReportId(profile.email, currentWeekKey());
      if (existingReportId) {
        await saveLog({ id: makeId(), profileId: profile.id, reportId: existingReportId, status: "completed", querySummary: "Existing weekly free report returned for this email.", rawResponse: "Free usage limit matched an existing report. No OpenAI web_search was called.", createdAt: new Date().toISOString() });
        return NextResponse.json({ reportId: existingReportId, reused: true });
      }
    }

    const matchedSearch = matchSearchBucket(profile);
    const topOffer = await getBestCachedOpportunityForProfile(profile, matchedSearch);
    const freeOffers = topOffer ? [topOffer] : [];
    const premiumOffers = mockOffers.filter((offer) => offer.isPremium).slice(0, 3);
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "completed", isPaid: false, matchedSearch, freeOffers, premiumOffers, createdAt: now, updatedAt: new Date().toISOString() };
    await saveReport(report);
    await saveWeeklyFreeUsage(profile.email, currentWeekKey(), reportId);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "completed", querySummary: `${matchedSearch.bucket.id}: ${matchedSearch.explanation}`, rawResponse: "Free flow reads approved Europe cached bucket opportunities or mock weekly examples. OpenAI web_search is not called during user submission.", createdAt: new Date().toISOString() });
    return NextResponse.json({ reportId, offers: freeOffers, matchedSearch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "failed", isPaid: false, freeOffers: [], premiumOffers: [], createdAt: now, updatedAt: new Date().toISOString(), errorMessage: message };
    await saveReport(report).catch(() => undefined);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "failed", querySummary: "Bucket matching or persistence failed before completion.", errorMessage: message, createdAt: new Date().toISOString() }).catch(() => undefined);
    Sentry.withScope((scope) => {
      scope.setTag("feature", "free-match");
      scope.setTag("route", "api/search-internships");
      scope.setTag("emailDomain", emailDomain(profile.email));
      scope.setTag("reportId", reportId);
      scope.setContext("free_match_failure", {
        errorMessage: message,
        hasSupabaseConfig: hasSupabaseConfig(),
        profileId: profile.id,
        reportId,
        desiredRoles: profile.desiredRoles,
        targetCountries: profile.targetCountries,
        desiredRolesCount: profile.desiredRoles.length,
        targetCountriesCount: profile.targetCountries.length
      });
      Sentry.captureException(error);
    });
    return NextResponse.json({ error: message, reportId }, { status: 500 });
  }
}
