import { NextResponse } from "next/server";
import { webInternshipSearch } from "@/lib/ai/webInternshipSearch";
import { saveLog, saveProfile, saveReport } from "@/lib/store";
import type { CandidateProfile, InternshipSearchReport } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const cv = formData.get("cv");
  const cvFileName = cv instanceof File ? cv.name : "uploaded-cv.pdf";
  const now = new Date().toISOString();

  const profile: CandidateProfile = {
    id: makeId("profile"),
    firstName: String(formData.get("firstName") ?? ""),
    email: String(formData.get("email") ?? ""),
    cvFileUrl: cvFileName,
    cvText: `Mock CV extraction for ${cvFileName}. Real PDF parsing will be added after storage is configured.`,
    targetCountries: splitList(formData.get("targetCountries")),
    targetCities: splitList(formData.get("targetCities")),
    targetIndustries: splitList(formData.get("targetIndustries")),
    desiredRoles: splitList(formData.get("desiredRoles")),
    internshipStartDate: String(formData.get("internshipStartDate") ?? ""),
    internshipDuration: String(formData.get("internshipDuration") ?? ""),
    languagesSpoken: splitList(formData.get("languagesSpoken")),
    minimumCompensation: String(formData.get("minimumCompensation") ?? ""),
    companiesAlreadyAppliedTo: splitList(formData.get("companiesAlreadyAppliedTo")),
    idealInternshipDescription: String(formData.get("idealInternshipDescription") ?? ""),
    thingsToAvoid: String(formData.get("thingsToAvoid") ?? ""),
    createdAt: now
  };

  if (!profile.email || !profile.cvFileUrl || !profile.targetCountries.length || !profile.desiredRoles.length) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  saveProfile(profile);
  const reportId = makeId("report");

  try {
    const result = await webInternshipSearch(profile, profile.cvText);
    const freeOffers = result.offers.slice(0, 2).map((offer) => ({ ...offer, isPremium: false }));
    const premiumOffers = result.offers.slice(2, 7).map((offer) => ({ ...offer, isPremium: true }));

    const report: InternshipSearchReport = {
      id: reportId,
      profileId: profile.id,
      status: "completed",
      isPaid: false,
      freeOffers,
      premiumOffers,
      createdAt: now,
      updatedAt: new Date().toISOString()
    };

    saveReport(report);
    saveLog({
      id: makeId("log"),
      profileId: profile.id,
      reportId,
      status: "completed",
      querySummary: result.querySummary,
      rawResponse: result.rawResponse,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({ reportId, offers: result.offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const report: InternshipSearchReport = {
      id: reportId,
      profileId: profile.id,
      status: "failed",
      isPaid: false,
      freeOffers: [],
      premiumOffers: [],
      createdAt: now,
      updatedAt: new Date().toISOString(),
      errorMessage: message
    };

    saveReport(report);
    saveLog({
      id: makeId("log"),
      profileId: profile.id,
      reportId,
      status: "failed",
      querySummary: "Search failed before completion.",
      errorMessage: message,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({ error: message, reportId }, { status: 500 });
  }
}
