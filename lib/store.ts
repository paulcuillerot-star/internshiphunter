import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mockCandidateProfile, mockReport } from "./mockData";
import { matchSearchBucket, searchBuckets } from "./searchBuckets";
import { getSupabaseServerClient, hasSupabaseConfig } from "./supabase/server";
import type { AdminSearchLog, CachedBucketOpportunity, CacheReviewStatus, CandidateProfile, InternshipSearchReport, MatchedSearchBucket, OfferFeedback, PremiumSearchInputs, PremiumSearchStatus, ScoredInternshipOffer, SearchRegion } from "./types";

const profiles = new Map<string, CandidateProfile>([[mockCandidateProfile.id, mockCandidateProfile]]);
const reports = new Map<string, InternshipSearchReport>([[mockReport.id, mockReport]]);
const feedback = new Map<string, OfferFeedback>();
const logs = new Map<string, AdminSearchLog>();
type StoreSnapshot = { profiles: CandidateProfile[]; reports: InternshipSearchReport[]; feedback: OfferFeedback[]; logs: AdminSearchLog[] };
const storeFile = path.join(process.cwd(), ".internship-hunter-store.json");
let hydrated = false;

function canUseFileFallback() { return process.env.NODE_ENV !== "production"; }
function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function bestOffer(offers: ScoredInternshipOffer[]) { return [...offers].sort((a, b) => (b.matchScore + b.qualityScore) - (a.matchScore + a.qualityScore))[0]; }
function createMockReportForId(id: string): InternshipSearchReport { const now = new Date().toISOString(); const matchedSearch = matchSearchBucket(mockCandidateProfile); const topOffer = bestOffer(matchedSearch.bucket.weeklyFreeOffers); return { ...mockReport, id, profileId: mockCandidateProfile.id, matchedSearch, freeOffers: topOffer ? [topOffer] : [], premiumOffers: mockReport.premiumOffers.map((offer) => ({ ...offer, isPremium: true })), premiumSearchStatus: "not_started", createdAt: now, updatedAt: now }; }
function hydrate() { if (hydrated || !canUseFileFallback() || !fs.existsSync(storeFile)) { hydrated = true; return; } try { const snapshot = JSON.parse(fs.readFileSync(storeFile, "utf8")) as Partial<StoreSnapshot>; snapshot.profiles?.forEach((item) => profiles.set(item.id, item)); snapshot.reports?.forEach((item) => reports.set(item.id, item)); snapshot.feedback?.forEach((item) => feedback.set(item.id, item)); snapshot.logs?.forEach((item) => logs.set(item.id, item)); } catch { } finally { hydrated = true; } }
function persist() { if (!canUseFileFallback()) return; fs.writeFileSync(storeFile, JSON.stringify({ profiles: Array.from(profiles.values()), reports: Array.from(reports.values()), feedback: Array.from(feedback.values()), logs: Array.from(logs.values()) }, null, 2)); }
function missingAccessTokenColumn(error: { code?: string; message?: string }) { return error.code === "PGRST204" || /access_token/i.test(error.message ?? ""); }

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
    accessToken: row.access_token ? String(row.access_token) : undefined,
    isPaid: Boolean(row.is_paid),
    matchedSearch,
    freeOffers: (row.free_offers as ScoredInternshipOffer[] | null) ?? [],
    premiumOffers: (row.premium_offers as ScoredInternshipOffer[] | null) ?? [],
    premiumInputs: (row.premium_inputs as PremiumSearchInputs | null) ?? undefined,
    premiumSearchStatus: (row.premium_search_status as PremiumSearchStatus | null) ?? "not_started",
    premiumSearchError: row.premium_search_error ? String(row.premium_search_error) : undefined,
    premiumSearchStartedAt: row.premium_search_started_at ? String(row.premium_search_started_at) : undefined,
    premiumSearchCompletedAt: row.premium_search_completed_at ? String(row.premium_search_completed_at) : undefined,
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

function mapCachedOpportunityRow(row: Record<string, unknown>): CachedBucketOpportunity {
  return {
    id: String(row.id),
    bucketId: String(row.bucket_id),
    category: row.category ? String(row.category) : undefined,
    region: row.region ? String(row.region) : undefined,
    title: String(row.title ?? ""),
    company: String(row.company ?? ""),
    location: String(row.location ?? ""),
    country: String(row.country ?? ""),
    city: String(row.city ?? ""),
    url: String(row.url ?? ""),
    source: String(row.source ?? ""),
    deadline: String(row.deadline ?? ""),
    publishedDate: String(row.published_date ?? ""),
    descriptionSummary: String(row.description_summary ?? ""),
    requirementsSummary: String(row.requirements_summary ?? ""),
    compensation: String(row.compensation ?? ""),
    languageRequirements: (row.language_requirements as string[] | null) ?? [],
    rawSourceSnippet: String(row.raw_source_snippet ?? ""),
    matchScore: Number(row.match_score ?? 85),
    qualityScore: Number(row.quality_score ?? 85),
    probabilityOfInterview: Number(row.probability_of_interview ?? 50),
    whyItMatches: (row.why_it_matches as string[] | null) ?? [],
    risks: (row.risks as string[] | null) ?? [],
    applicationAngle: String(row.application_angle ?? ""),
    linkedinMessage: String(row.linkedin_message ?? ""),
    coverLetterHook: String(row.cover_letter_hook ?? ""),
    isPremium: false,
    isLiveVerified: Boolean(row.is_live_verified),
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    refreshRunId: row.refresh_run_id ? String(row.refresh_run_id) : undefined,
    rawSources: (row.raw_sources as CachedBucketOpportunity["rawSources"] | null) ?? [],
    reviewStatus: (row.review_status as CacheReviewStatus | null) ?? "pending",
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined
  };
}

function toCachedOpportunityRow(item: CachedBucketOpportunity) {
  return {
    id: item.id,
    bucket_id: item.bucketId,
    category: item.category,
    region: item.region,
    title: item.title,
    company: item.company,
    location: item.location,
    country: item.country,
    city: item.city,
    url: item.url,
    source: item.source,
    deadline: item.deadline,
    published_date: item.publishedDate,
    description_summary: item.descriptionSummary,
    requirements_summary: item.requirementsSummary,
    compensation: item.compensation,
    language_requirements: item.languageRequirements,
    raw_source_snippet: item.rawSourceSnippet,
    match_score: item.matchScore,
    quality_score: item.qualityScore,
    probability_of_interview: item.probabilityOfInterview,
    why_it_matches: item.whyItMatches,
    risks: item.risks,
    application_angle: item.applicationAngle,
    linkedin_message: item.linkedinMessage,
    cover_letter_hook: item.coverLetterHook,
    is_live_verified: item.isLiveVerified,
    verified_at: item.verifiedAt,
    expires_at: item.expiresAt,
    refresh_run_id: item.refreshRunId,
    raw_sources: item.rawSources ?? [],
    review_status: item.reviewStatus ?? "pending",
    reviewed_at: item.reviewedAt,
    reviewed_by: item.reviewedBy,
    updated_at: new Date().toISOString()
  };
}

function lowerList(items: string[]) { return items.map((item) => item.toLowerCase()).filter(Boolean); }
function includesAny(value: string, words: string[]) { return words.some((word) => value.includes(word)); }
function isExpired(item: CachedBucketOpportunity) { return item.expiresAt ? new Date(item.expiresAt).getTime() < Date.now() : false; }
function hasDirectUrl(url: string) { return /greenhouse\.io|lever\.co|myworkdayjobs\.com|workdayjobs\.com|teamtailor\.com|smartrecruiters\.com|ashbyhq\.com|jobs\.|careers\.|\/careers|\/jobs|\/job\//i.test(url); }
function scoreCachedOpportunity(item: CachedBucketOpportunity, profile: CandidateProfile, matchedSearch: MatchedSearchBucket) {
  let score = item.matchScore + item.qualityScore;
  const countryTargets = lowerList(profile.targetCountries);
  const cityTargets = lowerList(profile.targetCities);
  const selectedTracks = lowerList(profile.desiredRoles);
  const languages = lowerList(profile.languagesSpoken);
  const appliedCompanies = lowerList(profile.companiesAlreadyAppliedTo);
  const avoid = profile.thingsToAvoid.toLowerCase().split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  const itemText = `${item.title} ${item.company} ${item.location} ${item.country} ${item.city} ${item.descriptionSummary} ${item.requirementsSummary}`.toLowerCase();

  if (includesAny(`${item.country} ${item.region}`.toLowerCase(), countryTargets) || countryTargets.includes(matchedSearch.region.toLowerCase())) score += 20;
  if (cityTargets.length && includesAny(item.city.toLowerCase(), cityTargets)) score += 15;
  if (selectedTracks.includes(matchedSearch.category.name.toLowerCase()) || item.category?.toLowerCase() === matchedSearch.category.name.toLowerCase()) score += 15;
  if (!languages.length || item.languageRequirements.length === 0 || item.languageRequirements.some((language) => languages.includes(language.toLowerCase()))) score += 8;
  if (appliedCompanies.includes(item.company.toLowerCase())) score -= 40;
  if (avoid.length && includesAny(itemText, avoid)) score -= 25;
  if (hasDirectUrl(item.url)) score += 10;
  return score;
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
    const row = { id: report.id, profile_id: report.profileId, status: report.status, access_token: report.accessToken, is_paid: Boolean(report.isPaid), matched_category: report.matchedSearch?.category.name, matched_region: report.matchedSearch?.region, matched_bucket_id: report.matchedSearch?.bucket.id, matched_bucket_title: report.matchedSearch?.bucket.displayTitle, matched_explanation: report.matchedSearch?.explanation, free_offers: report.freeOffers, premium_offers: report.premiumOffers, error_message: report.errorMessage, updated_at: report.updatedAt };
    const { error } = await supabase.from("search_reports").insert(row);
    if (error && missingAccessTokenColumn(error)) {
      const { access_token, ...rowWithoutAccessToken } = row;
      const retry = await supabase.from("search_reports").insert(rowWithoutAccessToken);
      if (retry.error) throw retry.error;
      return;
    }
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

export async function getReportIfAuthorized(id: string, token?: string) {
  const report = await getReport(id);
  if (!report) return undefined;
  if (report.accessToken && token && token === report.accessToken) return report;
  if (process.env.NODE_ENV !== "production" && !report.accessToken) return report;
  return undefined;
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

export async function saveCachedBucketOpportunities(items: CachedBucketOpportunity[]) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !items.length) return 0;
  const { error } = await supabase.from("cached_bucket_opportunities").insert(items.map((item) => toCachedOpportunityRow({ ...item, reviewStatus: item.reviewStatus ?? "pending" })));
  if (error) throw error;
  return items.length;
}

export async function listCachedOpportunitiesForBucket(bucketId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("cached_bucket_opportunities").select("*").eq("bucket_id", bucketId).order("quality_score", { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []).map((item) => mapCachedOpportunityRow(item));
}

export async function listCachedBucketOpportunities() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("cached_bucket_opportunities").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((item) => mapCachedOpportunityRow(item));
}

export async function updateCachedOpportunityReviewStatus(id: string, status: CacheReviewStatus) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const now = new Date().toISOString();
  const reviewed = status === "pending" ? { reviewed_at: null, reviewed_by: null } : { reviewed_at: now, reviewed_by: "admin" };
  const { error } = await supabase.from("cached_bucket_opportunities").update({ review_status: status, ...reviewed, updated_at: now }).eq("id", id);
  if (error) throw error;
}

export async function getBestCachedOpportunityForProfile(profile: CandidateProfile, matchedSearch: MatchedSearchBucket) {
  try {
    const cached = (await listCachedOpportunitiesForBucket(matchedSearch.bucket.id)).filter((item) => item.reviewStatus === "approved" && !isExpired(item) && item.url);
    const bestCached = cached.sort((a, b) => scoreCachedOpportunity(b, profile, matchedSearch) - scoreCachedOpportunity(a, profile, matchedSearch))[0];
    return bestCached ?? bestOffer(matchedSearch.bucket.weeklyFreeOffers);
  } catch {
    return bestOffer(matchedSearch.bucket.weeklyFreeOffers);
  }
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

export async function updateReportPremiumInputs(reportId: string, premiumInputs: PremiumSearchInputs) {
  hydrate();
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("search_reports").update({ premium_inputs: premiumInputs, premium_search_status: "pending_payment", premium_search_error: null, updated_at: now }).eq("id", reportId);
    if (error) throw error;
    return;
  }
  const report = reports.get(reportId) ?? createMockReportForId(reportId);
  reports.set(reportId, { ...report, premiumInputs, premiumSearchStatus: "pending_payment", premiumSearchError: undefined, updatedAt: now });
  persist();
}

export async function updateReportPremiumSearchStatus(reportId: string, status: PremiumSearchStatus, errorMessage?: string) {
  hydrate();
  const now = new Date().toISOString();
  const statusPatch = {
    premium_search_status: status,
    premium_search_error: errorMessage ?? null,
    premium_search_started_at: status === "running" ? now : undefined,
    premium_search_completed_at: status === "completed" || status === "failed" ? now : undefined,
    updated_at: now
  };
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("search_reports").update(statusPatch).eq("id", reportId);
    if (error) throw error;
    return;
  }
  const report = reports.get(reportId) ?? createMockReportForId(reportId);
  reports.set(reportId, { ...report, premiumSearchStatus: status, premiumSearchError: errorMessage, premiumSearchStartedAt: status === "running" ? now : report.premiumSearchStartedAt, premiumSearchCompletedAt: status === "completed" || status === "failed" ? now : report.premiumSearchCompletedAt, updatedAt: now });
  persist();
}

export async function updateReportPremiumOffers(reportId: string, offers: ScoredInternshipOffer[]) {
  hydrate();
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("search_reports").update({ premium_offers: offers, premium_search_status: "completed", premium_search_error: null, premium_search_completed_at: now, updated_at: now }).eq("id", reportId);
    if (error) throw error;
    return;
  }
  const report = reports.get(reportId) ?? createMockReportForId(reportId);
  reports.set(reportId, { ...report, premiumOffers: offers, premiumSearchStatus: "completed", premiumSearchError: undefined, premiumSearchCompletedAt: now, updatedAt: now });
  persist();
}

export async function markReportPaid(reportId: string) {
  hydrate();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { count, error } = await supabase
      .from("search_reports")
      .update({ is_paid: true, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", reportId);

    if (error) throw error;
    if (count === 0) throw new Error(`No report found to mark paid: ${reportId}`);
    return;
  }
  const report = reports.get(reportId); if (report) { reports.set(reportId, { ...report, isPaid: true, updatedAt: new Date().toISOString() }); persist(); }
}
