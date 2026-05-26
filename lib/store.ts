import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mockCandidateProfile, mockReport } from "./mockData";
import { matchSearchBucket, searchBuckets } from "./searchBuckets";
import { getSupabaseServerClient, hasSupabaseConfig } from "./supabase/server";
import type { AdminSearchLog, CandidateProfile, InternshipSearchReport, OfferFeedback, ScoredInternshipOffer, SearchRegion } from "./types";

const profiles = new Map<string, CandidateProfile>([[mockCandidateProfile.id, mockCandidateProfile]]);
const reports = new Map<string, InternshipSearchReport>([[mockReport.id, mockReport]]);
const feedback = new Map<string, OfferFeedback>();
const logs = new Map<string, AdminSearchLog>();
type StoreSnapshot = { profiles: CandidateProfile[]; reports: InternshipSearchReport[]; feedback: OfferFeedback[]; logs: AdminSearchLog[] };
const storeFile = path.join(process.cwd(), ".internship-hunter-store.json");
let hydrated = false;

function canUseFileFallback() { return process.env.NODE_ENV !== "production"; }
function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function createMockReportForId(id: string): InternshipSearchReport { const now = new Date().toISOString(); const matchedSearch = matchSearchBucket(mockCandidateProfile); return { ...mockReport, id, profileId: mockCandidateProfile.id, matchedSearch, freeOffers: matchedSearch.bucket.weeklyFreeOffers, premiumOffers: mockReport.premiumOffers.map((offer) => ({ ...offer, isPremium: true })), createdAt: now, updatedAt: now }; }
function hydrate() { if (hydrated || !canUseFileFallback() || !fs.existsSync(storeFile)) { hydrated = true; return; } try { const snapshot = JSON.parse(fs.readFileSync(storeFile, "utf8")) as Partial<StoreSnapshot>; snapshot.profiles?.forEach((item) => profiles.set(item.id, item)); snapshot.reports?.forEach((item) => reports.set(item.id, item)); snapshot.feedback?.forEach((item) => feedback.set(item.id, item)); snapshot.logs?.forEach((item) => logs.set(item.id, item)); } catch { } finally { hydrated = true; } }
function persist() { if (!canUseFileFallback()) return; fs.writeFileSync(storeFile, JSON.stringify({ profiles: Array.from(profiles.values()), reports: Array.from(reports.values()), feedback: Array.from(feedback.values()), logs: Array.from(logs.values()) }, null, 2)); }

function mapProfileRow(row: Record<string, unknown>): CandidateProfile {
  const email = String(row.email ?? "");
  return {
    id: String(row.id),
    firstName: "",
    email,
    cvFileUrl: String(row.cv_file_name ?? ""),
    cvText: "",
    targetCountries: (row.target_countries as string[] | null) ?? [],
    targetCities: (row.target_cities as string[] | null) ?? [],
    targetIndustries: (row.target_industries as string[] | null) ?? [],
    desiredRoles: (row.desired_roles as string[] | null) ?? [],
    internshipStartDate: String(row.internship_start_date ?? ""),
    internshipDuration: String(row.internship_duration ?? ""),
    languagesSpoken: (row.languages_spoken as string[] | null) ?? [],
    minimumCompensation: String(row.minimum_compensation ?? ""),
    companiesAlreadyAppliedTo: (row.companies_already_applied_to as string[] | null) ?? [],
    idealInternshipDescription: String(row.ideal_internship_description ?? ""),
    thingsToAvoid: String(row.things_to_avoid ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString())
  };
}

function mapReportRow(row: Record<string, unknown>): InternshipSearchReport {
  const fallbackMatch = matchSearchBucket(mockCandidateProfile);
  const bucket = searchBuckets.find((item) => item.id === row.matched_bucket_id) ?? fallbackMatch.bucket;
  const matchedSearch = row.matched_bucket_id ? {
    category: bucket.category,
    region: (row.matched_region as SearchRegion | null) ?? bucket.region,
    bucket,
    explanation: String(row.matched_explanation ?? bucket.whyThisBucketFits)
  } : undefined;

  return {
    id: String(row.id),
    profileId: String(row.profile_id ?? mockCandidateProfile.id),
    status: (row.status as InternshipSearchReport["status"] | null) ?? "completed",
    isPaid: Boolean(row.is_paid),
    matchedSearch,
    freeOffers: (row.free_offers as ScoredInternshipOffer[] | null) ?? [],
    premiumOffers: (row.premium_offers as ScoredInternshipOffer[] | null) ?? [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}

function mapFeedbackRow(row: Record<string, unknown>): OfferFeedback {
  return { id: String(row.id), reportId: String(row.report_id), offerId: String(row.offer_id), feedbackType: row.feedback_type as OfferFeedback["feedbackType"], comment: row.comment ? String(row.comment) : undefined, createdAt: String(row.created_at ?? new Date().toISOString()) };
}

function mapLogRow(row: Record<string, unknown>): AdminSearchLog {
  return { id: String(row.id), profileId: String(row.profile_id ?? ""), reportId: String(row.report_id ?? ""), status: row.status as AdminSearchLog["status"], querySummary: String(row.query_summary ?? ""), errorMessage: row.error_message ? String(row.error_message) : undefined, rawResponse: row.raw_response ? String(row.raw_response) : undefined, createdAt: String(row.created_at ?? new Date().toISOString()) };
}

export { hasSupabaseConfig };

export async function saveProfile(profile: CandidateProfile) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("user_profiles").insert({ id: profile.id, email: normalizeEmail(profile.email), cv_file_name: profile.cvFileUrl, target_countries: profile.targetCountries, target_cities: profile.targetCities, target_industries: profile.targetIndustries, desired_roles: profile.desiredRoles, internship_start_date: profile.internshipStartDate, internship_duration: profile.internshipDuration, languages_spoken: profile.languagesSpoken, minimum_compensation: profile.minimumCompensation ?? "", companies_already_applied_to: profile.companiesAlreadyAppliedTo, ideal_internship_description: profile.idealInternshipDescription, things_to_avoid: profile.thingsToAvoid });
    if (error) throw error;
    return;
  }
  profiles.set(profile.id, profile); persist();
}

export async function getProfile(id: string) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("user_profiles").select("*").eq("id", id).maybeSingle();
    return data ? mapProfileRow(data) : mockCandidateProfile;
  }
  return profiles.get(id) ?? mockCandidateProfile;
}

export async function saveReport(report: InternshipSearchReport) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("search_reports").insert({ id: report.id, profile_id: report.profileId, status: report.status, is_paid: Boolean(report.isPaid), matched_category: report.matchedSearch?.category.name, matched_region: report.matchedSearch?.region, matched_bucket_id: report.matchedSearch?.bucket.id, matched_bucket_title: report.matchedSearch?.bucket.displayTitle, matched_explanation: report.matchedSearch?.explanation, free_offers: report.freeOffers, premium_offers: report.premiumOffers, error_message: report.errorMessage, updated_at: report.updatedAt });
    if (error) throw error;
    return;
  }
  reports.set(report.id, report); persist();
}

export async function getReport(id: string) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("search_reports").select("*").eq("id", id).maybeSingle();
    return data ? mapReportRow(data) : undefined;
  }
  const report = reports.get(id); if (report) return report; return createMockReportForId(id);
}

export async function getWeeklyFreeUsageReportId(email: string, weekKey: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("free_usage_limits").select("report_id").eq("email", normalizeEmail(email)).eq("week_key", weekKey).maybeSingle();
  return data?.report_id ? String(data.report_id) : null;
}

export async function saveWeeklyFreeUsage(email: string, weekKey: string, reportId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const { error } = await supabase.from("free_usage_limits").insert({ email: normalizeEmail(email), week_key: weekKey, report_id: reportId });
  if (error && error.code !== "23505") throw error;
}

export async function listReports() {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("search_reports").select("*").order("created_at", { ascending: false }).limit(50);
    return (data ?? []).map((item) => mapReportRow(item));
  }
  return Array.from(reports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveFeedback(item: OfferFeedback) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("offer_feedback").insert({ id: item.id, report_id: item.reportId, offer_id: item.offerId, feedback_type: item.feedbackType, comment: item.comment });
    if (error) throw error;
    return;
  }
  feedback.set(item.id, item); persist();
}

export async function listFeedback() {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("offer_feedback").select("*").order("created_at", { ascending: false }).limit(100);
    return (data ?? []).map((item) => mapFeedbackRow(item));
  }
  return Array.from(feedback.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveLog(log: AdminSearchLog) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("search_logs").insert({ id: log.id, profile_id: log.profileId || null, report_id: log.reportId || null, status: log.status, query_summary: log.querySummary, error_message: log.errorMessage, raw_response: log.rawResponse });
    if (error) throw error;
    return;
  }
  logs.set(log.id, log); persist();
}

export async function listLogs() {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("search_logs").select("*").order("created_at", { ascending: false }).limit(100);
    return (data ?? []).map((item) => mapLogRow(item));
  }
  return Array.from(logs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markReportPaid(reportId: string) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    await supabase.from("search_reports").update({ is_paid: true, updated_at: new Date().toISOString() }).eq("id", reportId);
    return;
  }
  const report = reports.get(reportId); if (report) { reports.set(reportId, { ...report, isPaid: true, updatedAt: new Date().toISOString() }); persist(); }
}
