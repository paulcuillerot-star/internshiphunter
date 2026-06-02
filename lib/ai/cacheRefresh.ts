import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createOpenAIResponse } from "@/lib/openai";
import type { CachedBucketOpportunity, SearchBucket } from "@/lib/types";

type RefreshOpportunity = {
  title: string;
  company: string;
  location: string;
  country: string;
  city: string;
  url: string;
  source: string;
  deadline: string;
  publishedDate: string;
  descriptionSummary: string;
  requirementsSummary: string;
  compensation: string;
  languageRequirements: string[];
  rawSourceSnippet: string;
  matchScore: number;
  qualityScore: number;
  probabilityOfInterview: number;
  whyItMatches: string[];
  risks: string[];
  applicationAngle: string;
  linkedinMessage: string;
  coverLetterHook: string;
};

type RefreshResponse = { opportunities: RefreshOpportunity[] };
type OpenAIResponse = { output_text?: string; output?: Array<{ type?: string; action?: { sources?: Array<{ url?: string; title?: string; snippet?: string }> }; content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }> }> };
type RejectionReason = "missing_title_or_company" | "missing_location" | "unusable_url" | "generic_career_page" | "no_open_application_evidence" | "clearly_unpaid" | "not_internship" | "past_deadline";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "company", "location", "country", "city", "url", "source", "deadline", "publishedDate", "descriptionSummary", "requirementsSummary", "compensation", "languageRequirements", "rawSourceSnippet", "matchScore", "qualityScore", "probabilityOfInterview", "whyItMatches", "risks", "applicationAngle", "linkedinMessage", "coverLetterHook"],
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          country: { type: "string" },
          city: { type: "string" },
          url: { type: "string" },
          source: { type: "string" },
          deadline: { type: "string" },
          publishedDate: { type: "string" },
          descriptionSummary: { type: "string" },
          requirementsSummary: { type: "string" },
          compensation: { type: "string" },
          languageRequirements: { type: "array", items: { type: "string" } },
          rawSourceSnippet: { type: "string" },
          matchScore: { type: "integer" },
          qualityScore: { type: "integer" },
          probabilityOfInterview: { type: "integer" },
          whyItMatches: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          applicationAngle: { type: "string" },
          linkedinMessage: { type: "string" },
          coverLetterHook: { type: "string" }
        }
      }
    }
  }
};

const genericCareerPaths = new Set(["/careers", "/jobs", "/students", "/internships", "/early-careers", "/graduates"]);
const specificJobUrlSignal = /gh_jid|job[-_]?id|jobid|requisition|req[-_]?id|posting|position|vacancy|ashby_jid/i;

function textFromResponse(response: OpenAIResponse) {
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ?? "";
}

function sourcesFromResponse(response: OpenAIResponse) {
  const actionSources = response.output?.flatMap((item) => item.action?.sources ?? []) ?? [];
  const annotationSources = response.output?.flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? []).map((annotation) => ({ url: annotation.url, title: annotation.title })) ?? [];
  return [...actionSources, ...annotationSources].filter((source) => source.url);
}

function jsonErrorPosition(message: string) {
  const match = message.match(/position (\d+)/i);
  return match ? Number(match[1]) : null;
}

function excerptAround(text: string, position: number | null) {
  if (position === null || !Number.isFinite(position)) return undefined;
  const start = Math.max(0, position - 250);
  const end = Math.min(text.length, position + 250);
  return text.slice(start, end);
}

function parseRefreshResponse(response: OpenAIResponse): RefreshResponse {
  const text = textFromResponse(response).trim();
  if (!text) return { opportunities: [] };

  try {
    return JSON.parse(text) as RefreshResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    const position = jsonErrorPosition(message);
    const excerptAroundError = excerptAround(text, position);
    const rawResponseStart = text.slice(0, 1000);
    console.warn("[cache-refresh:parse-error]", {
      errorMessage: message,
      errorPosition: position,
      excerptAroundError,
      rawResponseStart
    });
    Sentry.withScope((scope) => {
      scope.setTag("feature", "cache-refresh");
      scope.setContext("cache_refresh_parse_error", {
        errorMessage: message,
        errorPosition: position,
        excerptAroundError,
        rawResponseStart
      });
      Sentry.captureMessage("Cache refresh OpenAI JSON parse failed", "warning");
    });
    return { opportunities: [] };
  }
}

function clampScore(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isUsableUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (host.includes("linkedin.com")) return false;
    if (host.includes("google.") || host.includes("bing.com")) return false;
    return true;
  } catch {
    return false;
  }
}

function isGenericCareerPathOnly(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (!genericCareerPaths.has(path)) return false;
    return !specificJobUrlSignal.test(parsed.search);
  } catch {
    return true;
  }
}

function isGenericCareerPage(item: RefreshOpportunity) {
  const title = item.title.toLowerCase().trim();
  const genericTitlePatterns = [
    /^internships? at\b/,
    /^internship opportunities\b/,
    /^students? and graduates?\b/,
    /^early careers?\b/,
    /^careers?\b/,
    /^jobs at\b/,
    /^open positions?\b/,
    /^graduate opportunities?\b/
  ];

  if (genericTitlePatterns.some((pattern) => pattern.test(title))) return true;
  if (isGenericCareerPathOnly(item.url)) return true;

  const combined = `${item.title} ${item.source} ${item.descriptionSummary} ${item.rawSourceSnippet}`.toLowerCase();
  return /talent community|job search results|search results|careers homepage|career homepage|generic internship program|students and graduates|early careers|open positions/.test(combined);
}

function hasOpenApplicationEvidence(item: RefreshOpportunity) {
  const text = `${item.source} ${item.descriptionSummary} ${item.requirementsSummary} ${item.rawSourceSnippet}`.toLowerCase();
  if (/apply now|apply online|apply by|applications? open|currently open|closing date|deadline|posted|job id|requisition|vacancy/.test(text)) return true;

  try {
    const host = new URL(item.url).hostname.toLowerCase();
    return /greenhouse|lever|workday|teamtailor|smartrecruiters|ashbyhq|jobs\.ashby|successfactors|bamboohr/.test(host) && !isGenericCareerPathOnly(item.url);
  } catch {
    return false;
  }
}

function isClearlyUnpaid(value: string) {
  const text = value.toLowerCase();
  return /unpaid|no compensation|volunteer|benevol/.test(text);
}

function isClearlyNotInternship(item: RefreshOpportunity) {
  const text = `${item.title} ${item.descriptionSummary} ${item.requirementsSummary}`.toLowerCase();
  if (!/intern|internship|trainee|traineeship|stage|praktikum|student placement|graduate internship/.test(text)) return true;
  return /senior|director|head of|lead\b|principal|full-time permanent|permanent role/.test(text);
}

function deadlineIsPast(deadline: string) {
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function getOpportunityRejectionReason(item: RefreshOpportunity): RejectionReason | null {
  if (!item.title?.trim() || !item.company?.trim()) return "missing_title_or_company";
  if (!item.location?.trim() && !item.country?.trim() && !item.city?.trim()) return "missing_location";
  if (!item.url || !isUsableUrl(item.url)) return "unusable_url";
  if (isGenericCareerPage(item)) return "generic_career_page";
  if (!hasOpenApplicationEvidence(item)) return "no_open_application_evidence";
  if (isClearlyUnpaid(`${item.compensation} ${item.rawSourceSnippet}`)) return "clearly_unpaid";
  if (isClearlyNotInternship(item)) return "not_internship";
  if (deadlineIsPast(item.deadline)) return "past_deadline";
  return null;
}

function deadlineRisk(deadline: string, now: Date) {
  const trimmed = deadline.trim();
  const parsed = Date.parse(trimmed);
  if (!trimmed || !Number.isFinite(parsed)) return "Deadline unclear; verify before applying.";
  const daysUntilDeadline = (parsed - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysUntilDeadline >= 0 && daysUntilDeadline <= 7) return "Deadline is close; apply quickly.";
  return null;
}

function normalizeOpportunity(item: RefreshOpportunity, bucket: SearchBucket, refreshRunId: string, now: Date, rawSources: CachedBucketOpportunity["rawSources"]): CachedBucketOpportunity | null {
  if (getOpportunityRejectionReason(item)) return null;

  const risks = [...(item.risks ?? [])];
  const addRisk = (risk: string) => {
    if (!risks.some((existing) => existing.toLowerCase() === risk.toLowerCase())) risks.push(risk);
  };

  if (!item.compensation || /not specified|not listed|unknown|n\/a/i.test(item.compensation)) addRisk("Compensation not specified; confirm before applying.");
  const dateRisk = deadlineRisk(item.deadline, now);
  if (dateRisk) addRisk(dateRisk);

  return {
    id: crypto.randomUUID(),
    bucketId: bucket.id,
    category: bucket.category.name,
    region: bucket.region,
    title: item.title.trim(),
    company: item.company.trim(),
    location: item.location.trim(),
    country: item.country.trim(),
    city: item.city.trim(),
    url: item.url.trim(),
    source: item.source.trim() || "OpenAI web_search",
    deadline: item.deadline.trim(),
    publishedDate: item.publishedDate.trim(),
    descriptionSummary: item.descriptionSummary.trim(),
    requirementsSummary: item.requirementsSummary.trim(),
    compensation: item.compensation.trim() || "Not specified",
    languageRequirements: item.languageRequirements ?? [],
    rawSourceSnippet: item.rawSourceSnippet.trim(),
    matchScore: clampScore(item.matchScore, 85),
    qualityScore: clampScore(item.qualityScore, 85),
    probabilityOfInterview: clampScore(item.probabilityOfInterview, 50),
    whyItMatches: item.whyItMatches ?? [],
    risks,
    applicationAngle: item.applicationAngle.trim(),
    linkedinMessage: item.linkedinMessage.trim(),
    coverLetterHook: item.coverLetterHook.trim(),
    isPremium: false,
    isLiveVerified: true,
    verifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    refreshRunId,
    rawSources,
    reviewStatus: "pending"
  };
}

async function createRefreshResponse(input: Record<string, unknown>) {
  try {
    return await createOpenAIResponse<OpenAIResponse>({ ...input, include: ["web_search_call.action.sources"] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("web_search_call.action.sources") && !message.includes("include")) throw error;
    return createOpenAIResponse<OpenAIResponse>(input);
  }
}

export async function refreshBucketOpportunities(bucket: SearchBucket, refreshRunId: string, limit: number) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `Find 5-8 high-quality current internship, trainee, graduate internship or student placement opportunities for business school students.\n\nThe goal is not to maximize quantity. The goal is to find opportunities that would make a student think: "this is genuinely relevant and attractive."\n\nBucket:\n- id: ${bucket.id}\n- category: ${bucket.category.name}\n- region/market: ${bucket.region}\n- track title: ${bucket.displayTitle}\n\nSearch strategy:\n- Search like a strong human internship researcher.\n- Prefer direct employer career pages and official ATS pages such as Greenhouse, Lever, Workday, Teamtailor, SmartRecruiters, Ashby or company job pages.\n- Prefer reputable companies, recognized organizations, strong brands, high-growth startups, sports organizations, international institutions, consulting firms, finance firms, tech companies, hospitality groups or other employers that business school students would consider attractive.\n- Prefer 4-6 month or 6-month internships when possible.\n- Prefer roles relevant to business school profiles: strategy, marketing, partnerships, sponsorship, sales, finance, operations, events, e-commerce, data/business analytics, project management or international business depending on the bucket.\n\nStrict rejection rules:\n- Reject generic career pages, generic internship program pages, talent community pages, job search result pages and company careers homepages.\n- Reject vague pages titled like "Internships at Company", "Students and graduates", "Early careers", "Careers", "Jobs at Company", "Open positions" or "Graduate opportunities".\n- Reject any opportunity that does not have a specific role title, a specific company, a specific location or clear remote/hybrid location, a direct URL to the specific job posting, and evidence that applications are currently open.\n- Reject clearly unpaid internships.\n- Accept paid, stipend, allowance, or compensation not specified if the employer/opportunity is strong.\n- If compensation is not specified, include exactly this risk: "Compensation not specified; confirm before applying."\n- Reject any offer without a direct usable URL.\n- Reject generic search result URLs, LinkedIn search URLs, Google URLs or pages that are not an actual specific job posting.\n- Reject senior roles, manager roles, full-time permanent roles and non-internship roles.\n- Reject roles where the deadline is clearly in the past.\n- Do not reject or downgrade an opportunity only because the deadline is close if applications are still open. Add exactly this risk instead: "Deadline is close; apply quickly."\n- If the deadline is unclear, accept only if the URL is a specific job posting and the opportunity is strong. Add exactly this risk: "Deadline unclear; verify before applying."\n- Reject low-quality filler opportunities. It is better to return 1-2 strong opportunities than 8 mediocre ones.\n\nScore calibration:\n- Do not give very high scores to vague or generic opportunities. Reject them instead.\n- Quality score above 90 requires a direct specific job posting URL, clearly open application, strong employer, strong bucket fit, and clear internship/trainee/student placement status.\n- Do not cap quality score only because a still-open deadline is close.\n\nOutput rules:\n- Return only valid JSON matching the schema.\n- Strings must not contain raw newline characters. Escape line breaks as \\n or replace them with spaces.\n- Escape quotes and line breaks properly inside every string value.\n- Keep summaries concise. rawSourceSnippet, descriptionSummary and requirementsSummary must each be 300 characters or fewer.\n- Do not copy long raw snippets from websites.\n- Every opportunity must include a direct URL to a specific job posting.\n- Every opportunity must include why it matches the bucket.\n- Every opportunity must include risks, especially if compensation or deadline is unclear.\n- Scores should be realistic. Do not give 95+ scores unless the opportunity is exceptionally strong.`;

  const response = await createRefreshResponse({
    model,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    tool_choice: "required",
    input: [
      { role: "system", content: "You are a careful internship cache refresh researcher. You validate URLs and reject generic pages, weak, expired, unpaid, senior or non-internship results. Quality matters more than quantity. Return only valid JSON with no raw newline characters inside strings." },
      { role: "user", content: prompt }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "bucket_opportunity_refresh",
        strict: true,
        schema: responseSchema
      }
    }
  });

  const parsed = parseRefreshResponse(response);
  const rawSources = sourcesFromResponse(response);
  const now = new Date();
  const rejectionDetails = parsed.opportunities
    .map((item) => ({ item, reason: getOpportunityRejectionReason(item) }))
    .filter((entry): entry is { item: RefreshOpportunity; reason: RejectionReason } => Boolean(entry.reason));
  const validatedOpportunities = parsed.opportunities
    .map((item) => normalizeOpportunity(item, bucket, refreshRunId, now, rawSources))
    .filter((item): item is CachedBucketOpportunity => Boolean(item));

  const refreshContext = {
    bucketId: bucket.id,
    refreshRunId,
    model,
    openAIOpportunityCount: parsed.opportunities.length,
    keptOpportunityCount: validatedOpportunities.length,
    rejectedOpportunityCount: rejectionDetails.length
  };
  const rejectionContext = rejectionDetails.map(({ item, reason }) => ({
    reason,
    title: item.title,
    company: item.company,
    url: item.url,
    deadline: item.deadline
  }));

  console.info("[cache-refresh:validation]", {
    ...refreshContext,
    rejections: rejectionContext
  });

  if (parsed.opportunities.length === 0) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "cache-refresh");
      scope.setTag("bucketId", bucket.id);
      scope.setContext("cache_refresh_zero_openai_opportunities", refreshContext);
      Sentry.captureMessage("Cache refresh returned zero OpenAI opportunities", "warning");
    });
  } else if (validatedOpportunities.length === 0) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "cache-refresh");
      scope.setTag("bucketId", bucket.id);
      scope.setContext("cache_refresh_zero_validated_opportunities", {
        ...refreshContext,
        rejections: rejectionContext
      });
      Sentry.captureMessage("Cache refresh kept zero opportunities after validation", "warning");
    });
  }

  return validatedOpportunities
    .sort((a, b) => (b.matchScore + b.qualityScore) - (a.matchScore + a.qualityScore))
    .slice(0, Math.max(1, Math.min(limit, 2)));
}
