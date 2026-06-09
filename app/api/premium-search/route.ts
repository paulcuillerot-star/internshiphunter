import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { webInternshipSearch } from "@/lib/ai/webInternshipSearch";
import { getProfile, getReportIfAuthorized, updateReportPremiumOffers, updateReportPremiumSearchStatus } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { CandidateProfile, InternshipSearchReport, PremiumLanguage, PremiumSearchBrief, PremiumSearchInputs, PremiumSearchStatus, ScoredInternshipOffer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const retryUsedMarker = "[retry-used]";
const verySoonDeadlineRisk = "Deadline is very soon; apply immediately.";
const missingDeadlineRisk = "Deadline not listed; verify before applying.";
const linkValidationTimeoutMs = 8_000;
const stalePostingYears = ["2019", "2020", "2021", "2022", "2023", "2024"];

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

function retryWasUsed(errorMessage?: string) {
  return Boolean(errorMessage?.includes(retryUsedMarker));
}

function premiumErrorType(errorMessage?: string) {
  if (!errorMessage) return "none";
  if (/payment required|unauthorized|forbidden|missing report|missing premium criteria|premium criteria are required|token|report access/i.test(errorMessage)) return "unrecoverable";
  if (/zero valid|No language-compatible|no strong leads/i.test(errorMessage)) return "zero_results";
  if (/OpenAI|web_search|JSON|parse|timeout|network|rate/i.test(errorMessage)) return "recoverable_search_error";
  return "technical_error";
}

function isClearlyUnrecoverablePremiumError(errorMessage?: string) {
  return premiumErrorType(errorMessage) === "unrecoverable";
}

function canRetryPremiumSearch(report: InternshipSearchReport) {
  return report.premiumOffers.length === 0 && !retryWasUsed(report.premiumSearchError) && !isClearlyUnrecoverablePremiumError(report.premiumSearchError);
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
    targetRolesCount: premiumInputs?.targetRoles?.length ?? 0,
    hardFiltersCount: premiumInputs?.hardFilters?.length ?? 0,
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
    scope.setContext("premium_deadline_rejection", {
      reportId,
      company: offer.company,
      title: offer.title,
      deadline: offer.deadline,
      reason
    });
    Sentry.captureMessage("Premium offer rejected for deadline quality", "warning");
  });
}

function captureLinkRejection(reportId: string, offer: ScoredInternshipOffer, reason: string, httpStatus?: number) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setTag("reason", reason);
    scope.setContext("premium_link_rejection", {
      reportId,
      company: offer.company,
      title: offer.title,
      urlHost: urlHost(offer.url),
      httpStatus,
      reason
    });
    Sentry.captureMessage("Premium offer rejected for link quality", "warning");
  });
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalizeLanguages(inputs: PremiumSearchInputs): PremiumLanguage[] {
  if (inputs.languages?.length) return inputs.languages;
  return inputs.languagesSpoken.map((language) => ({ language, level: "Working proficiency" }));
}

function buildPremiumSearchBrief(inputs: PremiumSearchInputs): PremiumSearchBrief {
  const hardFilters = inputs.hardFilters?.length ? inputs.hardFilters : inputs.thingsToAvoid ? [inputs.thingsToAvoid] : [];

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
    broadeningOrder: inputs.broadeningOrder?.length
      ? inputs.broadeningOrder
      : ["nearby cities", "adjacent roles in the same career family", "nearby countries or strong hubs", "broader high-signal companies"],
    profileSummary: inputs.profileSummary,
    idealInternshipDescription: inputs.idealInternshipDescription
  };
}

function mergePremiumProfile(profile: CandidateProfile, premiumInputs: PremiumSearchInputs): CandidateProfile {
  const searchBrief = buildPremiumSearchBrief(premiumInputs);
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
  return (
    (offer.matchType === "exact" || offer.matchType === "close") &&
    offer.matchScore >= 85 &&
    offer.qualityScore >= 80 &&
    hasDirectApplicationUrl(offer.url) &&
    isLanguageCompatibleEnough(offer)
  );
}

function withRisk(offer: ScoredInternshipOffer, risk: string): ScoredInternshipOffer {
  return offer.risks.some((item) => item.toLowerCase() === risk.toLowerCase()) ? offer : { ...offer, risks: [...offer.risks, risk] };
}

function filterPremiumDeadlineQuality(offers: ScoredInternshipOffer[], reportId: string) {
  return offers.flatMap((offer) => {
    const deadline = offer.deadline?.trim() ?? "";
    const parsedDeadline = parseDeadline(deadline);

    if (!parsedDeadline) {
      return [{ ...withRisk(offer, missingDeadlineRisk), deadline: deadline || "Deadline not listed" }];
    }

    const daysLeft = daysUntilDeadline(parsedDeadline);
    if (daysLeft <= 0) {
      captureDeadlineRejection(reportId, offer, "deadline_today_or_past");
      return [];
    }

    if (daysLeft === 1) {
      if (isExceptionalTomorrowOffer(offer)) {
        return [withRisk(offer, verySoonDeadlineRisk)];
      }

      captureDeadlineRejection(reportId, offer, "deadline_tomorrow_not_exceptional");
      return [];
    }

    return [offer];
  });
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
  return normalizePageText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !["intern", "internship", "stage", "trainee", "assistant", "the", "and", "with"].includes(token));
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
    if (head.status === 404 || head.status === 410) {
      return { status: head.status, finalUrl: head.url, text: "" };
    }
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

    if (status >= 400) {
      const reason = status === 403 ? "unreachable_url" : "unreachable_url";
      captureLinkRejection(reportId, offer, reason, status);
      return undefined;
    }

    if (hasClosedOrArchivedText(textForChecks)) {
      captureLinkRejection(reportId, offer, "archived_or_closed", status);
      return undefined;
    }

    if (hasStalePostingYear(textForChecks)) {
      captureLinkRejection(reportId, offer, "stale_posting", status);
      return undefined;
    }

    if (isGenericDestination(finalUrl) && !pageHasOfferEvidence(page.text, offer)) {
      captureLinkRejection(reportId, offer, "generic_redirect", status);
      return undefined;
    }

    if (!pageHasOfferEvidence(page.text, offer)) {
      captureLinkRejection(reportId, offer, "content_mismatch", status);
      return undefined;
    }

    return finalUrl === offer.url ? offer : { ...offer, url: finalUrl };
  } catch (error) {
    captureLinkRejection(reportId, offer, "unreachable_url");
    Sentry.addBreadcrumb({
      category: "premium-link-validation",
      level: "warning",
      message: "Premium offer link validation failed",
      data: { reportId, company: offer.company, title: offer.title, urlHost: urlHost(offer.url), error: error instanceof Error ? error.message : "unknown" }
    });
    return undefined;
  }
}

async function filterPremiumLinkQuality(offers: ScoredInternshipOffer[], reportId: string) {
  const validated: ScoredInternshipOffer[] = [];

  for (const offer of offers) {
    const checked = await validateOfferLink(offer, reportId);
    if (checked) validated.push(checked);
  }

  return validated;
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

  if (status === "pending_payment") {
    capturePremiumSearchMessage("Premium search blocked because payment is still pending", report, premiumInputs, "warning", retryRequested);
    return NextResponse.json({ error: "Payment confirmation is still pending.", status: "pending_payment", offerCount: report.premiumOffers.length }, { status: 409 });
  }

  if (status === "completed") {
    return NextResponse.json({ status: "completed", offerCount: report.premiumOffers.length });
  }

  if (status === "running") {
    capturePremiumSearchMessage("Premium search blocked because already running", report, premiumInputs, "warning", retryRequested);
    return NextResponse.json({ status: "running", offerCount: report.premiumOffers.length });
  }

  if (status === "failed") {
    const retryAvailable = canRetryPremiumSearch(report);

    if (!retryRequested) {
      capturePremiumSearchMessage("Premium search failed state returned", report, premiumInputs, "warning");
      return NextResponse.json(
        {
          error: retryAvailable
            ? "Premium search did not deliver strong leads. You can retry once with broader criteria at no extra cost."
            : "Premium search failed. Please contact support with this report id.",
          retryAvailable
        },
        { status: 409 }
      );
    }

    if (!retryAvailable) {
      capturePremiumSearchMessage("Premium search retry blocked", report, premiumInputs, "warning", true);
      return NextResponse.json({ error: "Premium search retry is not available. Please contact support with this report id." }, { status: 409 });
    }
  }

  if (status !== "ready_to_run" && status !== "not_started" && !(status === "failed" && retryRequested)) {
    capturePremiumSearchMessage("Premium search blocked because status is not runnable", report, premiumInputs, "warning", retryRequested);
    return NextResponse.json({ error: "Premium search is not ready to run.", status, offerCount: report.premiumOffers.length }, { status: 409 });
  }

  try {
    await updateReportPremiumSearchStatus(report.id, "running");
    capturePremiumSearchMessage("Premium search started", { ...report, premiumSearchStatus: "running" }, premiumInputs, "info", retryRequested);

    const profile = await getProfile(report.profileId);
    const premiumProfile = mergePremiumProfile(profile, premiumInputs);
    const result = await webInternshipSearch(premiumProfile, premiumProfile.cvText, { retryMode: retryRequested });
    const linkCheckedOffers = await filterPremiumLinkQuality(result.offers, report.id);
    const offers = filterPremiumDeadlineQuality(linkCheckedOffers, report.id).slice(0, 3).map((offer) => ({ ...offer, isPremium: true }));

    if (!offers.length) {
      throw new Error("Premium live search returned zero valid opportunities after link and deadline filtering.");
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
        retryAvailable: !retryRequested && canRetryPremiumSearch({ ...report, premiumSearchError: storedMessage })
      },
      { status: 500 }
    );
  }
}
