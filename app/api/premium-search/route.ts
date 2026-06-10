import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { webInternshipSearch } from "@/lib/ai/webInternshipSearch";
import { getProfile, getReportIfAuthorized, updateReportPremiumOffers, updateReportPremiumSearchStatus } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { CandidateProfile, InternshipSearchReport, PremiumLanguage, PremiumSearchBrief, PremiumSearchInputs, PremiumSearchStatus, ScoredInternshipOffer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BroadeningStrategy = "broaden_locations" | "broaden_roles" | "relax_one_hard_filter" | "include_nearby_industries" | "broader_company_sources";
type SearchPassKind = "direct_ats" | "exact_location" | "role_synonyms" | "industry_company" | "source_discovery";

type RejectionSummary = {
  offersDetected: number;
  offersRejected: number;
  reasons: string[];
  passesAttempted: number;
  candidatesDetectedPerPass: number[];
  candidatesRejectedPerPass: number[];
  finalValidOffers: number;
};

type PassResult = {
  passKind: SearchPassKind;
  detected: number;
  rejected: number;
  kept: ScoredInternshipOffer[];
  reasons: string[];
  querySummary?: string;
};

const retryUsedMarker = "[retry-used]";
const noStrongMatchesMarker = "[no-strong-matches]";
const secondSearchUsedMarker = "[second-search-used]";
const verySoonDeadlineRisk = "Deadline is very soon; apply immediately.";
const missingDeadlineRisk = "Deadline not listed; verify before applying.";
const contentUnverifiedRisk = "Could not fully verify page content; verify before applying.";
const linkValidationTimeoutMs = 8_000;
const minimumSearchPasses = 4;
const targetCandidateThreshold = 8;
const maxSearchPasses = 5;
const stalePostingYears = ["2019", "2020", "2021", "2022", "2023", "2024"];

const broadeningStrategies: BroadeningStrategy[] = ["broaden_locations", "broaden_roles", "relax_one_hard_filter", "include_nearby_industries", "broader_company_sources"];
const searchPasses: SearchPassKind[] = ["direct_ats", "exact_location", "role_synonyms", "industry_company", "source_discovery"];

const directApplicationHosts = [
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "teamtailor.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "factorialhr.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "bamboohr.com",
  "recruitee.com",
  "personio.com",
  "homerun.co"
];

function normalizeBroadeningStrategy(value?: string): BroadeningStrategy | undefined {
  return broadeningStrategies.includes(value as BroadeningStrategy) ? (value as BroadeningStrategy) : undefined;
}

function retryWasUsed(errorMessage?: string) {
  return Boolean(errorMessage?.includes(retryUsedMarker) || errorMessage?.includes(secondSearchUsedMarker));
}

function isNoStrongMatchesOutcome(errorMessage?: string) {
  return Boolean(errorMessage?.includes(noStrongMatchesMarker));
}

function premiumErrorType(errorMessage?: string) {
  if (!errorMessage) return "none";
  if (isNoStrongMatchesOutcome(errorMessage)) return "no_strong_matches";
  if (/payment required|unauthorized|forbidden|missing report|missing premium criteria|premium criteria are required|token|report access/i.test(errorMessage)) return "unrecoverable";
  if (/zero valid|No language-compatible|no strong leads|weak aggregator|after link and deadline filtering|No strong matches found/i.test(errorMessage)) return "zero_results";
  if (/OpenAI|web_search|JSON|parse|timeout|network|rate/i.test(errorMessage)) return "recoverable_search_error";
  return "technical_error";
}

function isClearlyUnrecoverablePremiumError(errorMessage?: string) {
  return premiumErrorType(errorMessage) === "unrecoverable";
}

function canRetryPremiumSearch(report: InternshipSearchReport) {
  return report.premiumOffers.length === 0 && !retryWasUsed(report.premiumSearchError) && !isClearlyUnrecoverablePremiumError(report.premiumSearchError);
}

function sentryContext(report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, retry = false, broadeningStrategy?: BroadeningStrategy) {
  return {
    reportId: report.id,
    profileId: report.profileId,
    retry,
    broadeningStrategy,
    status: report.premiumSearchStatus ?? "not_started",
    hasOffers: report.premiumOffers.length > 0,
    errorType: premiumErrorType(report.premiumSearchError),
    hasPremiumInputs: Boolean(premiumInputs),
    targetCountriesCount: premiumInputs?.targetCountries.length ?? 0,
    targetCitiesCount: premiumInputs?.targetCities.length ?? 0,
    languagesCount: premiumInputs?.languagesSpoken.length ?? 0,
    targetRolesCount: premiumInputs?.targetRoles?.length ?? 0,
    hardFiltersCount: premiumInputs?.hardFilters?.length ?? 0,
    premiumSearchStatus: report.premiumSearchStatus ?? "not_started",
    offerCount: report.premiumOffers.length
  };
}

function capturePremiumSearchMessage(message: string, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, level: "info" | "warning" | "error" = "info", retry = false, broadeningStrategy?: BroadeningStrategy) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setTag("retry", String(retry));
    if (broadeningStrategy) scope.setTag("broadeningStrategy", broadeningStrategy);
    scope.setContext("premium_search", sentryContext(report, premiumInputs, retry, broadeningStrategy));
    Sentry.captureMessage(message, level);
  });
}

function capturePremiumSearchException(error: unknown, report: InternshipSearchReport, premiumInputs?: PremiumSearchInputs, retry = false, broadeningStrategy?: BroadeningStrategy) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("profileId", report.profileId);
    scope.setTag("retry", String(retry));
    if (broadeningStrategy) scope.setTag("broadeningStrategy", broadeningStrategy);
    scope.setContext("premium_search", sentryContext(report, premiumInputs, retry, broadeningStrategy));
    Sentry.captureException(error);
  });
}

function urlHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "invalid_url";
  }
}

function captureDeadlineRejection(reportId: string, offer: ScoredInternshipOffer, reason: string) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setTag("reason", reason);
    scope.setContext("premium_deadline_rejection", { reportId, company: offer.company, title: offer.title, deadline: offer.deadline, reason });
    Sentry.captureMessage("Premium offer rejected for deadline quality", "warning");
  });
}

function captureLinkRejection(reportId: string, offer: ScoredInternshipOffer, reason: string, httpStatus?: number) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setTag("reason", reason);
    scope.setContext("premium_link_rejection", { reportId, company: offer.company, title: offer.title, urlHost: urlHost(offer.url), httpStatus, reason });
    Sentry.captureMessage("Premium offer rejected for link quality", "warning");
  });
}

function captureLinkWarning(reportId: string, offer: ScoredInternshipOffer, reason: string, httpStatus?: number) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setTag("reason", reason);
    scope.setContext("premium_link_warning", { reportId, company: offer.company, title: offer.title, urlHost: urlHost(offer.url), httpStatus, reason });
    Sentry.captureMessage("Premium offer link content could not be fully verified", "warning");
  });
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalizeLanguages(inputs: PremiumSearchInputs): PremiumLanguage[] {
  if (inputs.languages?.length) return inputs.languages;
  return inputs.languagesSpoken.map((language) => ({ language, level: "Working proficiency" }));
}

function buildPremiumSearchBrief(inputs: PremiumSearchInputs, broadeningStrategy?: BroadeningStrategy): PremiumSearchBrief {
  const hardFilters = inputs.hardFilters?.length ? inputs.hardFilters : inputs.thingsToAvoid ? [inputs.thingsToAvoid] : [];
  const selectedBroadeningOrder = broadeningStrategy
    ? [`Selected second-search strategy: ${broadeningStrategy.replace(/_/g, " ")}`]
    : inputs.broadeningOrder?.length
      ? inputs.broadeningOrder
      : ["nearby cities", "adjacent roles in the same career family", "nearby countries or strong hubs", "broader high-signal companies"];

  return {
    targetRoles: inputs.targetRoles ?? [],
    rolePriority: inputs.rolePriority?.length ? inputs.rolePriority : inputs.targetRoles ?? [],
    targetIndustries: inputs.targetIndustries ?? [],
    strictCities: inputs.strictCities?.length ? inputs.strictCities : inputs.targetCities,
    acceptableCountries: inputs.acceptableCountries?.length ? inputs.acceptableCountries : inputs.targetCountries,
    remoteAccepted: Boolean(inputs.remoteAccepted),
    languages: normalizeLanguages(inputs),
    internshipStartDate: inputs.internshipStartDate,
    internshipDuration: inputs.internshipDuration,
    durationStrictness: inputs.durationStrictness ?? "flexible",
    companiesAlreadyAppliedTo: inputs.companiesAlreadyAppliedTo,
    hardFilters,
    softPreferences: inputs.softPreferences ?? [],
    broadeningOrder: selectedBroadeningOrder,
    profileSummary: inputs.profileSummary,
    idealInternshipDescription: inputs.idealInternshipDescription
  };
}

function mergePremiumProfile(profile: CandidateProfile, premiumInputs: PremiumSearchInputs, broadeningStrategy?: BroadeningStrategy): CandidateProfile {
  const searchBrief = buildPremiumSearchBrief(premiumInputs, broadeningStrategy);
  const languageNames = searchBrief.languages.map((item) => item.language).filter(Boolean);
  const desiredRoles = unique([...searchBrief.rolePriority, ...searchBrief.targetRoles]);
  const thingsToAvoid = unique([premiumInputs.thingsToAvoid, ...searchBrief.hardFilters]).join("\n");

  return {
    ...profile,
    desiredRoles: desiredRoles.length ? desiredRoles : profile.desiredRoles,
    targetCountries: searchBrief.acceptableCountries.length ? searchBrief.acceptableCountries : premiumInputs.targetCountries,
    targetCities: searchBrief.strictCities.length ? searchBrief.strictCities : premiumInputs.targetCities,
    targetIndustries: searchBrief.targetIndustries.length ? searchBrief.targetIndustries : profile.targetIndustries,
    languagesSpoken: languageNames.length ? languageNames : premiumInputs.languagesSpoken,
    internshipStartDate: premiumInputs.internshipStartDate,
    internshipDuration: premiumInputs.internshipDuration,
    companiesAlreadyAppliedTo: premiumInputs.companiesAlreadyAppliedTo,
    thingsToAvoid,
    idealInternshipDescription: premiumInputs.idealInternshipDescription,
    cvText: premiumInputs.profileSummary || profile.cvText,
    premiumSearchBrief: searchBrief
  };
}

function roleSynonyms(roles: string[]) {
  const text = roles.join(" ").toLowerCase();
  const synonyms: string[] = [];
  if (/business development|bd|sales|commercial/.test(text)) synonyms.push("sales intern", "commercial intern", "partnerships intern");
  if (/marketing|brand|growth/.test(text)) synonyms.push("brand marketing intern", "growth marketing intern", "campaign intern");
  if (/partnership|sponsorship/.test(text)) synonyms.push("partnerships intern", "sponsorship intern", "business development intern");
  if (/event/.test(text)) synonyms.push("event management intern", "event operations intern");
  if (/strategy|consulting|project/.test(text)) synonyms.push("strategy intern", "project management intern", "business analyst intern");
  return unique(synonyms).slice(0, 5);
}

function industrySynonyms(industries: string[]) {
  const text = industries.join(" ").toLowerCase();
  const synonyms: string[] = [];
  if (/automotive|car/.test(text)) synonyms.push("mobility", "auto manufacturer", "car industry", "dealership group");
  if (/sport/.test(text)) synonyms.push("sports agency", "club", "federation", "tournament");
  if (/fashion|luxury/.test(text)) synonyms.push("luxury group", "fashion", "retail");
  if (/tech|saas|startup/.test(text)) synonyms.push("startup", "scaleup", "SaaS", "technology company");
  return unique(synonyms).slice(0, 5);
}

function profileForPass(profile: CandidateProfile, passKind: SearchPassKind): CandidateProfile {
  const brief = profile.premiumSearchBrief;
  if (!brief) return profile;

  if (passKind === "direct_ats") {
    return { ...profile, premiumSearchBrief: { ...brief, broadeningOrder: ["Direct employer and ATS pages only", "Greenhouse Lever Workday Teamtailor SmartRecruiters Ashby"] } };
  }

  if (passKind === "exact_location") {
    return { ...profile, premiumSearchBrief: { ...brief, broadeningOrder: ["Exact role and exact target city or country only", "Do not relax hard filters"] } };
  }

  if (passKind === "role_synonyms") {
    const synonyms = roleSynonyms([...brief.rolePriority, ...brief.targetRoles, ...profile.desiredRoles]);
    return {
      ...profile,
      desiredRoles: unique([...profile.desiredRoles, ...synonyms]),
      premiumSearchBrief: { ...brief, targetRoles: unique([...brief.targetRoles, ...synonyms]), rolePriority: unique([...brief.rolePriority, ...synonyms]), broadeningOrder: ["Use same career-family role synonyms only", "Keep exact locations and hard filters"] }
    };
  }

  if (passKind === "industry_company") {
    const synonyms = industrySynonyms([...brief.targetIndustries, ...profile.targetIndustries]);
    return {
      ...profile,
      targetIndustries: unique([...profile.targetIndustries, ...synonyms]),
      premiumSearchBrief: { ...brief, targetIndustries: unique([...brief.targetIndustries, ...synonyms]), broadeningOrder: ["Industry and company-specific search", "Recognized companies only", "Keep language and hard filters strict"] }
    };
  }

  return { ...profile, premiumSearchBrief: { ...brief, broadeningOrder: ["Broader source discovery using direct employer and ATS pages", "Keep criteria and hard filters strict", "Do not broaden language compatibility"] } };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function deadlineLooksUnknown(deadline: string) {
  return !deadline.trim() || /not listed|not specified|unknown|unclear|rolling|open until filled|as soon as possible/i.test(deadline);
}

function parseDeadline(deadline: string, today = new Date()) {
  if (deadlineLooksUnknown(deadline)) return null;
  if (/\btoday\b/i.test(deadline)) return startOfDay(today);
  if (/\btomorrow\b/i.test(deadline)) {
    const tomorrow = startOfDay(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const cleaned = deadline
    .replace(/application deadline|apply by|deadline|closing date|closes|applications close|until/gi, " ")
    .replace(/[|•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? null : startOfDay(new Date(parsed));
}

function daysUntilDeadline(deadlineDate: Date, today = new Date()) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((deadlineDate.getTime() - startOfDay(today).getTime()) / msPerDay);
}

function hostMatches(host: string, domains: string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isTrustedDirectApplicationHost(url: string) {
  return hostMatches(urlHost(url), directApplicationHosts);
}

function hasDirectApplicationUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return hostMatches(host, directApplicationHosts) || /careers?|jobs?|job-detail|positions?|openings?|vacancies?|internship|apply/i.test(url);
  } catch {
    return false;
  }
}

function isLanguageCompatibleEnough(offer: ScoredInternshipOffer) {
  return !/incompatible|not compatible|requires.+not spoken|candidate does not speak/i.test(`${offer.languageFit} ${offer.risks.join(" ")}`);
}

function isExceptionalTomorrowOffer(offer: ScoredInternshipOffer) {
  return (offer.matchType === "exact" || offer.matchType === "close") && offer.matchScore >= 85 && offer.qualityScore >= 80 && hasDirectApplicationUrl(offer.url) && isLanguageCompatibleEnough(offer);
}

function withRisk(offer: ScoredInternshipOffer, risk: string): ScoredInternshipOffer {
  return offer.risks.some((item) => item.toLowerCase() === risk.toLowerCase()) ? offer : { ...offer, risks: [...offer.risks, risk] };
}

function filterPremiumDeadlineQuality(offers: ScoredInternshipOffer[], reportId: string) {
  const kept: ScoredInternshipOffer[] = [];
  const reasons: string[] = [];

  for (const offer of offers) {
    const deadline = offer.deadline?.trim() ?? "";
    const parsedDeadline = parseDeadline(deadline);

    if (!parsedDeadline) {
      kept.push({ ...withRisk(offer, missingDeadlineRisk), deadline: deadline || "Deadline not listed" });
      continue;
    }

    const daysLeft = daysUntilDeadline(parsedDeadline);
    if (daysLeft <= 0) {
      reasons.push("deadline_today_or_past");
      captureDeadlineRejection(reportId, offer, "deadline_today_or_past");
      continue;
    }

    if (daysLeft === 1) {
      if (isExceptionalTomorrowOffer(offer)) {
        kept.push(withRisk(offer, verySoonDeadlineRisk));
        continue;
      }

      reasons.push("deadline_tomorrow_not_exceptional");
      captureDeadlineRejection(reportId, offer, "deadline_tomorrow_not_exceptional");
      continue;
    }

    kept.push(offer);
  }

  return { offers: kept, reasons };
}

function normalizePageText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalizePageText(value).split(" ").filter((token) => token.length >= 4 && !["intern", "internship", "stage", "trainee", "assistant", "the", "and", "with"].includes(token));
}

function pageHasOfferEvidence(text: string, offer: ScoredInternshipOffer) {
  const normalized = normalizePageText(text);
  const companyTokens = meaningfulTokens(offer.company);
  const titleTokens = meaningfulTokens(offer.title);
  const companyMatch = companyTokens.length > 0 && companyTokens.some((token) => normalized.includes(token));
  const titleMatches = titleTokens.filter((token) => normalized.includes(token)).length;
  return companyMatch || titleMatches >= Math.min(2, titleTokens.length || 2);
}

function isGenericDestination(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
    return path === "" || path === "/" || /\/(careers?|jobs?|openings?|positions?|vacancies?|search|job-search|opportunities)$/.test(path);
  } catch {
    return true;
  }
}

function hasClosedOrArchivedText(text: string) {
  return /job not found|position closed|job closed|this job is no longer available|no longer accepting applications|posting has expired|job expired|archived|removed|not found|404|410/i.test(text);
}

function hasStalePostingYear(text: string) {
  const normalized = normalizePageText(text).slice(0, 40_000);
  return stalePostingYears.some((year) => {
    const yearIndex = normalized.indexOf(year);
    if (yearIndex === -1) return false;
    const window = normalized.slice(Math.max(0, yearIndex - 80), yearIndex + 80);
    return /intern|internship|stage|trainee|deadline|closing|apply|posted|job|role|position/.test(window);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), linkValidationTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOfferPage(url: string) {
  let headStatus: number | undefined;

  try {
    const head = await fetchWithTimeout(url, { method: "HEAD", headers: { "User-Agent": "InternshipHunter/1.0" } });
    headStatus = head.status;
    if (head.status === 404 || head.status === 410) return { status: head.status, finalUrl: head.url, text: "" };
  } catch {
    // Many ATS pages block HEAD. GET below is the source of truth.
  }

  const response = await fetchWithTimeout(url, { method: "GET", headers: { "User-Agent": "InternshipHunter/1.0", Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" } });
  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("text") || contentType.includes("html") || contentType.includes("json") ? (await response.text()).slice(0, 120_000) : "";
  return { status: response.status || headStatus, finalUrl: response.url || url, text };
}

async function validateOfferLink(offer: ScoredInternshipOffer, reportId: string) {
  try {
    const page = await fetchOfferPage(offer.url);
    const status = page.status ?? 0;
    const finalUrl = page.finalUrl || offer.url;
    const textForChecks = `${finalUrl}\n${offer.title}\n${offer.company}\n${offer.deadline}\n${offer.publishedDate}\n${page.text}`;
    const trustedDirectHost = isTrustedDirectApplicationHost(finalUrl) || isTrustedDirectApplicationHost(offer.url);
    const reachable = status >= 200 && status < 400;

    if (status >= 400) {
      captureLinkRejection(reportId, offer, "unreachable_url", status);
      return { offer: undefined, reason: "unreachable_url" };
    }

    if (hasClosedOrArchivedText(textForChecks)) {
      captureLinkRejection(reportId, offer, "archived_or_closed", status);
      return { offer: undefined, reason: "archived_or_closed" };
    }

    if (hasStalePostingYear(textForChecks)) {
      captureLinkRejection(reportId, offer, "stale_posting", status);
      return { offer: undefined, reason: "stale_posting" };
    }

    if (isGenericDestination(finalUrl) && !pageHasOfferEvidence(page.text, offer)) {
      captureLinkRejection(reportId, offer, "generic_redirect", status);
      return { offer: undefined, reason: "generic_redirect" };
    }

    if (!pageHasOfferEvidence(page.text, offer)) {
      if (trustedDirectHost && reachable) {
        captureLinkWarning(reportId, offer, "content_unverified_trusted_ats", status);
        return { offer: withRisk(finalUrl === offer.url ? offer : { ...offer, url: finalUrl }, contentUnverifiedRisk) };
      }

      captureLinkRejection(reportId, offer, "content_mismatch", status);
      return { offer: undefined, reason: "content_mismatch" };
    }

    return { offer: finalUrl === offer.url ? offer : { ...offer, url: finalUrl } };
  } catch (error) {
    captureLinkRejection(reportId, offer, "unreachable_url");
    Sentry.addBreadcrumb({ category: "premium-link-validation", level: "warning", message: "Premium offer link validation failed", data: { reportId, company: offer.company, title: offer.title, urlHost: urlHost(offer.url), error: error instanceof Error ? error.message : "unknown" } });
    return { offer: undefined, reason: "unreachable_url" };
  }
}

async function filterPremiumLinkQuality(offers: ScoredInternshipOffer[], reportId: string) {
  const validated: ScoredInternshipOffer[] = [];
  const reasons: string[] = [];

  for (const offer of offers) {
    const checked = await validateOfferLink(offer, reportId);
    if (checked.offer) validated.push(checked.offer);
    if (checked.reason) reasons.push(checked.reason);
  }

  return { offers: validated, reasons };
}

function mainReasons(reasons: string[]) {
  return Array.from(new Set(reasons)).slice(0, 5);
}

function offerKey(offer: ScoredInternshipOffer) {
  const url = offer.url.trim().toLowerCase().replace(/\/$/, "");
  const companyTitle = `${offer.company} ${offer.title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return url || companyTitle;
}

function dedupeOffers(offers: ScoredInternshipOffer[]) {
  const seen = new Set<string>();
  const uniqueOffers: ScoredInternshipOffer[] = [];
  for (const offer of offers) {
    const key = offerKey(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueOffers.push(offer);
  }
  return uniqueOffers;
}

function shouldContinueMinimumEffort(passCount: number, detectedCount: number, validCount: number) {
  if (validCount > 0) return false;
  if (passCount < minimumSearchPasses) return true;
  if (detectedCount < 3 && passCount < maxSearchPasses) return true;
  if (detectedCount < targetCandidateThreshold && passCount < maxSearchPasses) return true;
  return false;
}

async function runValidatedPass(profile: CandidateProfile, reportId: string, retryRequested: boolean, broadeningStrategy: BroadeningStrategy | undefined, passKind: SearchPassKind): Promise<PassResult> {
  const passProfile = profileForPass(profile, passKind);
  const result = await webInternshipSearch(passProfile, passProfile.cvText, { retryMode: retryRequested, broadeningStrategy });
  const linkChecked = await filterPremiumLinkQuality(result.offers, reportId);
  const deadlineChecked = filterPremiumDeadlineQuality(linkChecked.offers, reportId);
  const kept = deadlineChecked.offers.map((offer) => ({ ...offer, isPremium: true }));
  return {
    passKind,
    detected: result.offers.length,
    rejected: Math.max(0, result.offers.length - kept.length),
    kept,
    reasons: [...linkChecked.reasons, ...deadlineChecked.reasons],
    querySummary: result.querySummary
  };
}

function effortSummary(passResults: PassResult[], finalOffers: ScoredInternshipOffer[]): RejectionSummary {
  const offersDetected = passResults.reduce((sum, pass) => sum + pass.detected, 0);
  const offersRejected = passResults.reduce((sum, pass) => sum + pass.rejected, 0);
  return {
    offersDetected,
    offersRejected,
    reasons: mainReasons(passResults.flatMap((pass) => pass.reasons.length ? pass.reasons : pass.detected === 0 ? [`${pass.passKind}_zero_detected`] : [])),
    passesAttempted: passResults.length,
    candidatesDetectedPerPass: passResults.map((pass) => pass.detected),
    candidatesRejectedPerPass: passResults.map((pass) => pass.rejected),
    finalValidOffers: finalOffers.length
  };
}

function noStrongMatchesMessage(summary: RejectionSummary, retryRequested: boolean, broadeningStrategy?: BroadeningStrategy) {
  const markers = [noStrongMatchesMarker, retryRequested ? secondSearchUsedMarker : "", broadeningStrategy ? `[strategy:${broadeningStrategy}]` : ""].filter(Boolean).join(" ");
  const reasons = summary.reasons.length ? summary.reasons.join(", ") : "quality_filters";
  return `${markers} No strong matches found. search_passes_attempted=${summary.passesAttempted}; candidates_detected_per_pass=${summary.candidatesDetectedPerPass.join("|")}; candidates_rejected_per_pass=${summary.candidatesRejectedPerPass.join("|")}; offers_detected=${summary.offersDetected}; offers_rejected=${summary.offersRejected}; main_rejection_reasons=${reasons}; final_strong_matches=${summary.finalValidOffers}.`;
}

function isNoStrongMatchesError(message: string) {
  return /No language-compatible|zero valid|weak aggregator|after link and deadline filtering|No strong matches found/i.test(message);
}

function captureNoStrongMatches(report: InternshipSearchReport, premiumInputs: PremiumSearchInputs, summary: RejectionSummary, retryRequested: boolean, broadeningStrategy?: BroadeningStrategy) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", report.id);
    scope.setTag("retry", String(retryRequested));
    if (broadeningStrategy) scope.setTag("broadeningStrategy", broadeningStrategy);
    scope.setContext("premium_no_strong_matches", {
      ...sentryContext(report, premiumInputs, retryRequested, broadeningStrategy),
      searchPassesAttempted: summary.passesAttempted,
      candidatesDetectedPerPass: summary.candidatesDetectedPerPass,
      candidatesRejectedPerPass: summary.candidatesRejectedPerPass,
      offersDetected: summary.offersDetected,
      offersRejected: summary.offersRejected,
      mainRejectionReasons: summary.reasons,
      finalStrongMatches: summary.finalValidOffers
    });
    Sentry.captureMessage("Premium search found no strong matches after minimum effort", "info");
  });
}

async function collectPremiumOffersWithMinimumEffort(profile: CandidateProfile, report: InternshipSearchReport, retryRequested: boolean, broadeningStrategy?: BroadeningStrategy) {
  const passResults: PassResult[] = [];
  let collected: ScoredInternshipOffer[] = [];

  for (const passKind of searchPasses) {
    try {
      const pass = await runValidatedPass(profile, report.id, retryRequested, broadeningStrategy, passKind);
      passResults.push(pass);
      collected = dedupeOffers([...collected, ...pass.kept]).slice(0, 3);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown premium search error";
      if (!isNoStrongMatchesError(message)) throw error;
      passResults.push({ passKind, detected: 0, rejected: 0, kept: [], reasons: [message.includes("weak aggregator") ? "weak_aggregator_or_job_board" : `${passKind}_zero_detected`] });
    }

    const detectedCount = passResults.reduce((sum, pass) => sum + pass.detected, 0);
    if (!shouldContinueMinimumEffort(passResults.length, detectedCount, collected.length)) break;
  }

  return { offers: collected.slice(0, 3), summary: effortSummary(passResults, collected), querySummary: passResults.map((pass) => `${pass.passKind}: ${pass.querySummary ?? "no query summary"}`).join("\n") };
}

export async function POST(request: Request) {
  const { reportId, token, retry, broadeningStrategy } = (await request.json()) as { reportId?: string; token?: string; retry?: boolean; broadeningStrategy?: string };
  const retryRequested = Boolean(retry);
  const selectedBroadeningStrategy = normalizeBroadeningStrategy(broadeningStrategy);
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

  if (retryRequested && !selectedBroadeningStrategy) {
    return NextResponse.json({ error: "Choose what to broaden before launching the second search." }, { status: 400 });
  }

  if (status === "pending_payment") {
    capturePremiumSearchMessage("Premium search blocked because payment is still pending", report, premiumInputs, "warning", retryRequested, selectedBroadeningStrategy);
    return NextResponse.json({ error: "Payment confirmation is still pending.", status: "pending_payment", offerCount: report.premiumOffers.length }, { status: 409 });
  }

  if (status === "completed") {
    return NextResponse.json({ status: "completed", offerCount: report.premiumOffers.length });
  }

  if (status === "running") {
    capturePremiumSearchMessage("Premium search blocked because already running", report, premiumInputs, "warning", retryRequested, selectedBroadeningStrategy);
    return NextResponse.json({ status: "running", offerCount: report.premiumOffers.length });
  }

  if (status === "failed") {
    const retryAvailable = canRetryPremiumSearch(report);

    if (!retryRequested) {
      capturePremiumSearchMessage("Premium search failed state returned", report, premiumInputs, "warning");
      return NextResponse.json(
        {
          error: isNoStrongMatchesOutcome(report.premiumSearchError)
            ? "No strong matches found. Choose what to broaden if you want one second search."
            : retryAvailable
              ? "Premium search did not deliver strong leads. You can retry once with broader criteria at no extra cost."
              : "Premium search failed. Please contact support with this report id.",
          retryAvailable
        },
        { status: 409 }
      );
    }

    if (!retryAvailable) {
      capturePremiumSearchMessage("Premium search retry blocked", report, premiumInputs, "warning", true, selectedBroadeningStrategy);
      return NextResponse.json({ error: "A second premium search has already been used for this report." }, { status: 409 });
    }
  }

  if (status !== "ready_to_run" && status !== "not_started" && !(status === "failed" && retryRequested)) {
    capturePremiumSearchMessage("Premium search blocked because status is not runnable", report, premiumInputs, "warning", retryRequested, selectedBroadeningStrategy);
    return NextResponse.json({ error: "Premium search is not ready to run.", status, offerCount: report.premiumOffers.length }, { status: 409 });
  }

  let rejectionSummary: RejectionSummary = { offersDetected: 0, offersRejected: 0, reasons: [], passesAttempted: 0, candidatesDetectedPerPass: [], candidatesRejectedPerPass: [], finalValidOffers: 0 };

  try {
    await updateReportPremiumSearchStatus(report.id, "running");
    capturePremiumSearchMessage("Premium search started", { ...report, premiumSearchStatus: "running" }, premiumInputs, "info", retryRequested, selectedBroadeningStrategy);

    const profile = await getProfile(report.profileId);
    const premiumProfile = mergePremiumProfile(profile, premiumInputs, selectedBroadeningStrategy);
    const result = await collectPremiumOffersWithMinimumEffort(premiumProfile, report, retryRequested, selectedBroadeningStrategy);
    const offers = result.offers;
    rejectionSummary = result.summary;

    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-search");
      scope.setTag("reportId", report.id);
      scope.setTag("retry", String(retryRequested));
      if (selectedBroadeningStrategy) scope.setTag("broadeningStrategy", selectedBroadeningStrategy);
      scope.setContext("premium_search_effort", {
        searchPassesAttempted: rejectionSummary.passesAttempted,
        candidatesDetectedPerPass: rejectionSummary.candidatesDetectedPerPass,
        candidatesRejectedPerPass: rejectionSummary.candidatesRejectedPerPass,
        offersDetected: rejectionSummary.offersDetected,
        offersRejected: rejectionSummary.offersRejected,
        finalValidOffers: rejectionSummary.finalValidOffers,
        topRejectionReasons: rejectionSummary.reasons
      });
      Sentry.captureMessage("Premium search minimum effort completed", "info");
    });

    if (!offers.length) {
      throw new Error("No strong matches found after minimum search effort.");
    }

    await updateReportPremiumOffers(report.id, offers);
    capturePremiumSearchMessage("Premium search completed", { ...report, premiumOffers: offers, premiumSearchStatus: "completed" }, premiumInputs, "info", retryRequested, selectedBroadeningStrategy);
    return NextResponse.json({ status: "completed", offerCount: offers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown premium search error";
    const noStrongMatches = isNoStrongMatchesError(message);

    if (noStrongMatches) {
      const fallbackSummary = rejectionSummary.passesAttempted
        ? rejectionSummary
        : { offersDetected: 0, offersRejected: 0, reasons: ["search_quality_filters"], passesAttempted: 0, candidatesDetectedPerPass: [], candidatesRejectedPerPass: [], finalValidOffers: 0 };
      const storedMessage = noStrongMatchesMessage(fallbackSummary, retryRequested, selectedBroadeningStrategy);
      await updateReportPremiumSearchStatus(report.id, "failed", storedMessage).catch(() => undefined);
      captureNoStrongMatches({ ...report, premiumSearchStatus: "failed", premiumSearchError: storedMessage }, premiumInputs, fallbackSummary, retryRequested, selectedBroadeningStrategy);
      return NextResponse.json({ status: "failed", outcome: "no_strong_matches", retryAvailable: !retryRequested && canRetryPremiumSearch({ ...report, premiumSearchError: storedMessage }), offerCount: 0 });
    }

    const storedMessage = retryRequested ? `${retryUsedMarker} ${message}` : message;
    await updateReportPremiumSearchStatus(report.id, "failed", storedMessage).catch(() => undefined);
    capturePremiumSearchMessage("Premium search failed", { ...report, premiumSearchStatus: "failed", premiumSearchError: storedMessage }, premiumInputs, "error", retryRequested, selectedBroadeningStrategy);
    capturePremiumSearchException(error, { ...report, premiumSearchError: storedMessage }, premiumInputs, retryRequested, selectedBroadeningStrategy);
    return NextResponse.json(
      {
        error: retryRequested
          ? "Premium search still could not run cleanly after retry. Please contact support with this report id."
          : "Premium search hit a technical issue. You can retry once if the issue looks recoverable.",
        retryAvailable: !retryRequested && canRetryPremiumSearch({ ...report, premiumSearchError: storedMessage })
      },
      { status: 500 }
    );
  }
}
