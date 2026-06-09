import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { saveProfile, saveReport } from "@/lib/store";
import type { CandidateProfile, InternshipSearchReport } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function PremiumStartPage() {
  noStore();

  const now = new Date().toISOString();
  const profileId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  const accessToken = crypto.randomUUID();

  const profile: CandidateProfile = {
    id: profileId,
    firstName: "",
    email: `premium-direct-${profileId}@internshiphunter.local`,
    cvFileUrl: "",
    cvText: "",
    targetCountries: [],
    targetCities: [],
    targetIndustries: [],
    desiredRoles: [],
    internshipStartDate: "",
    internshipDuration: "",
    languagesSpoken: [],
    minimumCompensation: "",
    companiesAlreadyAppliedTo: [],
    idealInternshipDescription: "",
    thingsToAvoid: "",
    createdAt: now
  };

  const report: InternshipSearchReport = {
    id: reportId,
    profileId,
    status: "completed",
    accessToken,
    isPaid: false,
    freeOffers: [],
    premiumOffers: [],
    premiumSearchStatus: "not_started",
    createdAt: now,
    updatedAt: now
  };

  await saveProfile(profile);
  await saveReport(report);

  redirect(`/premium/${reportId}?token=${encodeURIComponent(accessToken)}`);
}
