import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { mockOffers } from "@/lib/mockData";
import { getActiveFreeBucketById, matchSearchBucketFromBucketId } from "@/lib/searchBuckets";
import { getBestCachedOpportunityForProfile, getReport, getWeeklyFreeUsageReportId, hasSupabaseConfig, saveLog, saveProfile, saveReport, saveWeeklyFreeUsage } from "@/lib/store";
import type { CandidateProfile, InternshipSearchReport } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function splitList(value: FormDataEntryValue | null) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function listField(formData: FormData, name: string) {
  const values = formData.getAll(name).flatMap((value) => splitList(value));
  return Array.from(new Set(values));
}
function exactFieldValues(formData: FormData, name: string) {
  return formData.getAll(name).map((value) => String(value).trim()).filter(Boolean);
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

function captureValidationFailure(reason: string, profile: CandidateProfile, details: { selectedTrackId?: string; bucketId?: string; selectedTrackCount: number; desiredRolesCount: number }) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "free-match");
    scope.setTag("route", "api/search-internships");
    scope.setTag("reason", reason);
    scope.setTag("emailDomain", emailDomain(profile.email));
    if (details.selectedTrackId) scope.setTag("selectedTrackId", details.selectedTrackId);
    if (details.bucketId) scope.setTag("bucketId", details.bucketId);
    scope.setContext("free_match_validation", {
      reason,
      selectedTrackId: details.selectedTrackId,
      bucketId: details.bucketId,
      selectedTrackCount: details.selectedTrackCount,
      desiredRolesCount: details.desiredRolesCount,
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
  const selectedTrackIds = exactFieldValues(formData, "selectedTrackId");
  const selectedTrackId = selectedTrackIds[0] ?? "";
  const bucketId = selectedTrackId;
  const legacyDesiredRoles = listField(formData, "desiredRoles");
  const selectedMarkets = ["Europe"];
  const profile: CandidateProfile = { id: makeId(), firstName: String(formData.get("firstName") ?? ""), email: normalizeEmail(String(formData.get("email") ?? "")), cvFileUrl: cvFileName, cvText: cv instanceof File && cv.size > 0 ? `Mock CV extraction for ${cvFileName}. Real PDF parsing will be added after storage is configured.` : "CV not provided in the free flow. Premium search will use the CV later.", targetCountries: selectedMarkets, targetCities: listField(formData, "targetCities"), targetIndustries: [], desiredRoles: selectedTrackId ? [selectedTrackId] : [], internshipStartDate: String(formData.get("internshipStartDate") ?? ""), internshipDuration: String(formData.get("internshipDuration") ?? ""), languagesSpoken: listField(formData, "languagesSpoken"), minimumCompensation: "", companiesAlreadyAppliedTo: listField(formData, "companiesAlreadyAppliedTo"), idealInternshipDescription: "", thingsToAvoid: String(formData.get("thingsToAvoid") ?? ""), createdAt: now };
  const validationDetails = { selectedTrackId, bucketId, selectedTrackCount: selectedTrackIds.length, desiredRolesCount: legacyDesiredRoles.length };

  if (!profile.email || !profile.targetCountries.length || !selectedTrackId) {
    captureValidationFailure("missing_required_fields", profile, validationDetails);
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (selectedTrackIds.length > 1) {
    captureValidationFailure("too_many_internship_tracks", profile, validationDetails);
    return NextResponse.json({ error: "Select exactly one internship track." }, { status: 400 });
  }
  if (!getActiveFreeBucketById(bucketId)) {
    captureValidationFailure("invalid_internship_track", profile, validationDetails);
    return NextResponse.json({ error: "Invalid internship track." }, { status: 400 });
  }

  const reportId = makeId();
  const accessToken = makeId();

  try {
    await saveProfile(profile);

    if (hasSupabaseConfig()) {
      const existingReportId = await getWeeklyFreeUsageReportId(profile.email, currentWeekKey());
      if (existingReportId) {
        const existingReport = await getReport(existingReportId);
        await saveLog({ id: makeId(), profileId: profile.id, reportId: existingReportId, status: "completed", querySummary: "Existing weekly free report returned for this email.", rawResponse: "Free usage limit matched an existing report. No OpenAI web_search was called.", createdAt: new Date().toISOString() });
        return NextResponse.json({ reportId: existingReportId, accessToken: existingReport?.accessToken, reused: true });
      }
    }

    const matchedSearch = matchSearchBucketFromBucketId(bucketId);
    if (!matchedSearch) {
      captureValidationFailure("invalid_internship_track", profile, validationDetails);
      return NextResponse.json({ error: "Invalid internship track." }, { status: 400 });
    }

    const topOffer = await getBestCachedOpportunityForProfile(profile, matchedSearch);
    const freeOffers = topOffer ? [topOffer] : [];
    const premiumOffers = mockOffers.filter((offer) => offer.isPremium).slice(0, 3);
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "completed", accessToken, isPaid: false, matchedSearch, freeOffers, premiumOffers, createdAt: now, updatedAt: new Date().toISOString() };
    await saveReport(report);
    await saveWeeklyFreeUsage(profile.email, currentWeekKey(), reportId);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "completed", querySummary: `${matchedSearch.bucket.id}: ${matchedSearch.explanation}`, rawResponse: "Free flow reads approved Europe cached bucket opportunities or mock weekly examples. OpenAI web_search is not called during user submission.", createdAt: new Date().toISOString() });
    return NextResponse.json({ reportId, accessToken, offers: freeOffers, matchedSearch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "failed", accessToken, isPaid: false, freeOffers: [], premiumOffers: [], createdAt: now, updatedAt: new Date().toISOString(), errorMessage: message };
    await saveReport(report).catch(() => undefined);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "failed", querySummary: "Bucket matching or persistence failed before completion.", errorMessage: message, createdAt: new Date().toISOString() }).catch(() => undefined);
    Sentry.withScope((scope) => {
      scope.setTag("feature", "free-match");
      scope.setTag("route", "api/search-internships");
      scope.setTag("emailDomain", emailDomain(profile.email));
      scope.setTag("reportId", reportId);
      scope.setTag("selectedTrackId", selectedTrackId);
      scope.setTag("bucketId", bucketId);
      scope.setContext("free_match_failure", {
        errorMessage: message,
        hasSupabaseConfig: hasSupabaseConfig(),
        profileId: profile.id,
        reportId,
        selectedTrackId,
        bucketId,
        selectedTrackCount: selectedTrackIds.length,
        desiredRolesCount: legacyDesiredRoles.length,
        targetCountries: profile.targetCountries,
        targetCountriesCount: profile.targetCountries.length
      });
      Sentry.captureException(error);
    });
    return NextResponse.json({ error: message, reportId }, { status: 500 });
  }
}
