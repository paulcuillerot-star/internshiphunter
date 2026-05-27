import "server-only";
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

function textFromResponse(response: OpenAIResponse) {
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ?? "";
}

function sourcesFromResponse(response: OpenAIResponse) {
  const actionSources = response.output?.flatMap((item) => item.action?.sources ?? []) ?? [];
  const annotationSources = response.output?.flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? []).map((annotation) => ({ url: annotation.url, title: annotation.title })) ?? [];
  return [...actionSources, ...annotationSources].filter((source) => source.url);
}

function parseRefreshResponse(response: OpenAIResponse): RefreshResponse {
  const text = textFromResponse(response).trim();
  if (!text) return { opportunities: [] };
  return JSON.parse(text) as RefreshResponse;
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

function isClearlyUnpaid(value: string) {
  const text = value.toLowerCase();
  return /unpaid|no compensation|volunteer|benevol|bénévol/.test(text);
}

function isClearlyNotInternship(item: RefreshOpportunity) {
  const text = `${item.title} ${item.descriptionSummary} ${item.requirementsSummary}`.toLowerCase();
  if (!/intern|internship|trainee|traineeship|stage|praktikum/.test(text)) return true;
  return /senior|director|head of|lead\b|principal|full-time permanent|permanent role/.test(text);
}

function deadlineIsPast(deadline: string) {
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function normalizeOpportunity(item: RefreshOpportunity, bucket: SearchBucket, refreshRunId: string, now: Date, rawSources: CachedBucketOpportunity["rawSources"]): CachedBucketOpportunity | null {
  if (!item.url || !isUsableUrl(item.url)) return null;
  if (isClearlyUnpaid(`${item.compensation} ${item.rawSourceSnippet}`)) return null;
  if (isClearlyNotInternship(item)) return null;
  if (deadlineIsPast(item.deadline)) return null;

  const risks = [...(item.risks ?? [])];
  if (!item.compensation || /not specified|not listed|unknown|n\/a/i.test(item.compensation)) risks.push("Compensation is not specified; confirm before applying.");

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
    rawSources
  };
}

export async function refreshBucketOpportunities(bucket: SearchBucket, refreshRunId: string, limit: number) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `Find 5-8 current internship or traineeship opportunities for business school students.\n\nBucket: ${bucket.id}\nCategory: ${bucket.category.name}\nRegion/market: ${bucket.region}\nTrack title: ${bucket.displayTitle}\n\nSearch like a strong human internship researcher: targeted queries, employer career pages, Greenhouse, Lever, Workday, Teamtailor, SmartRecruiters, Ashby and official job pages.\n\nRules:\n- Return only internships, traineeships, stages or student placements suitable for business school students.\n- Reject clearly unpaid internships. Accept paid, stipend, allowance, or compensation not specified if the employer/opportunity is strong. If compensation is not specified, include it as a risk.\n- Reject offers without a usable URL. Prefer direct employer or official ATS URLs. Avoid generic Google URLs. Avoid LinkedIn URLs.\n- Reject senior, full-time permanent or non-internship roles.\n- Reject expired roles when the deadline is clearly in the past.\n- Prioritize recent, relevant, high-quality opportunities over quantity.\n- Return strict JSON only.`;

  const response = await createOpenAIResponse<OpenAIResponse>({
    model,
    tools: [{ type: "web_search", search_context_size: "low" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: [
      { role: "system", content: "You are a careful internship cache refresh researcher. You validate URLs and reject weak or non-internship results." },
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
  return parsed.opportunities
    .map((item) => normalizeOpportunity(item, bucket, refreshRunId, now, rawSources))
    .filter((item): item is CachedBucketOpportunity => Boolean(item))
    .sort((a, b) => (b.matchScore + b.qualityScore) - (a.matchScore + a.qualityScore))
    .slice(0, Math.max(1, Math.min(limit, 2)));
}
