import { NextResponse } from "next/server";
import { mockOffers } from "@/lib/mockData";
import { matchSearchBucket } from "@/lib/searchBuckets";
import { getWeeklyFreeUsageReportId, hasSupabaseConfig, saveLog, saveProfile, saveReport, saveWeeklyFreeUsage } from "@/lib/store";
import type { CandidateProfile, InternshipSearchReport, ScoredInternshipOffer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function splitList(value: FormDataEntryValue | null) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function listField(formData: FormData, name: string) {
  const values = formData.getAll(name).flatMap((value) => splitList(value));
  return Array.from(new Set(values));
}
function makeId() { return crypto.randomUUID(); }
function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function currentWeekKey() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const day = Math.floor((Number(now) - Number(start)) / 86400000);
  const week = Math.ceil((day + start.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function bestFreeOffer(offers: ScoredInternshipOffer[]) {
  return [...offers].sort((a, b) => (b.matchScore + b.qualityScore) - (a.matchScore + a.qualityScore))[0];
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const cv = formData.get("cv");
  const cvFileName = cv instanceof File ? cv.name : "uploaded-cv.pdf";
  const now = new Date().toISOString();
  const selectedTracks = listField(formData, "desiredRoles");
  const selectedMarkets = listField(formData, "targetCountries");
  const profile: CandidateProfile = { id: makeId(), firstName: String(formData.get("firstName") ?? ""), email: normalizeEmail(String(formData.get("email") ?? "")), cvFileUrl: cvFileName, cvText: `Mock CV extraction for ${cvFileName}. Real PDF parsing will be added after storage is configured.`, targetCountries: selectedMarkets, targetCities: listField(formData, "targetCities"), targetIndustries: [], desiredRoles: selectedTracks, internshipStartDate: String(formData.get("internshipStartDate") ?? ""), internshipDuration: String(formData.get("internshipDuration") ?? ""), languagesSpoken: listField(formData, "languagesSpoken"), minimumCompensation: "", companiesAlreadyAppliedTo: listField(formData, "companiesAlreadyAppliedTo"), idealInternshipDescription: "", thingsToAvoid: String(formData.get("thingsToAvoid") ?? ""), createdAt: now };
  if (!profile.email || !profile.cvFileUrl || !profile.targetCountries.length || !profile.desiredRoles.length) return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  if (profile.desiredRoles.length > 2) return NextResponse.json({ error: "Select no more than 2 internship tracks." }, { status: 400 });

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
    const topOffer = bestFreeOffer(matchedSearch.bucket.weeklyFreeOffers);
    const freeOffers = topOffer ? [topOffer] : [];
    // Future cache refresh rule: reject clearly unpaid internships; accept paid, stipend,
    // allowance or unspecified compensation when the opportunity is strong. Treat
    // unspecified compensation as a visible risk/note, not a hard rejection.
    const premiumOffers = mockOffers.filter((offer) => offer.isPremium).slice(0, 5);
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "completed", isPaid: false, matchedSearch, freeOffers, premiumOffers, createdAt: now, updatedAt: new Date().toISOString() };
    await saveReport(report);
    await saveWeeklyFreeUsage(profile.email, currentWeekKey(), reportId);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "completed", querySummary: `${matchedSearch.bucket.id}: ${matchedSearch.explanation}`, rawResponse: "Free flow uses rule-based bucket matching with cached/mock weekly examples. OpenAI web_search is not called.", createdAt: new Date().toISOString() });
    return NextResponse.json({ reportId, offers: freeOffers, matchedSearch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const report: InternshipSearchReport = { id: reportId, profileId: profile.id, status: "failed", isPaid: false, freeOffers: [], premiumOffers: [], createdAt: now, updatedAt: new Date().toISOString(), errorMessage: message };
    await saveReport(report).catch(() => undefined);
    await saveLog({ id: makeId(), profileId: profile.id, reportId, status: "failed", querySummary: "Bucket matching or persistence failed before completion.", errorMessage: message, createdAt: new Date().toISOString() }).catch(() => undefined);
    return NextResponse.json({ error: message, reportId }, { status: 500 });
  }
}
