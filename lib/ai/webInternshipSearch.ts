import "server-only";
import * as Sentry from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";
import { createOpenAIResponse, hasOpenAIConfig } from "@/lib/openai";
import { mockOffers } from "@/lib/mockData";
import type { CandidateProfile, PremiumMatchType, ScoredInternshipOffer } from "@/lib/types";

type OpenAITextResponse = { output_text?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
type KeywordDefinition = { term: string; aliases: string[] };
type SearchPass = 1 | 2 | 3;
type WebInternshipSearchOptions = { retryMode?: boolean; pass?: SearchPass };
type ParseContext = { profile: CandidateProfile; queryCount: number; retry: boolean };
type Rejection = { reason: string; title: string; company: string; url: string; matchType?: PremiumMatchType };
type PassDiagnostic = { pass: SearchPass; parsedOfferCount: number; keptOfferCount: number; rejectionReasons: Record<string, number> };
type ValidationResult = { offer: ScoredInternshipOffer; rejection?: string };

const outputSchema = {
  type: "json_schema",
  name: "premium_internship_search_results",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      offers: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
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
            matchScore: { type: "number" },
            qualityScore: { type: "number" },
            probabilityOfInterview: { type: "number" },
            whyItMatches: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
            applicationAngle: { type: "string" },
            linkedinMessage: { type: "string" },
            coverLetterHook: { type: "string" },
            matchType: { type: "string", enum: ["exact", "close", "broadened"] },
            broadenedReason: { type: "string" },
            languageFit: { type: "string" },
            isPremium: { type: "boolean" }
          },
          required: ["title", "company", "location", "country", "city", "url", "source", "deadline", "publishedDate", "descriptionSummary", "requirementsSummary", "compensation", "languageRequirements", "rawSourceSnippet", "matchScore", "qualityScore", "probabilityOfInterview", "whyItMatches", "risks", "applicationAngle", "linkedinMessage", "coverLetterHook", "matchType", "broadenedReason", "languageFit", "isPremium"]
        }
      }
    },
    required: ["offers"]
  }
} as const;

const roleKeywordDefinitions: KeywordDefinition[] = [
  { term: "business development", aliases: ["business development", "biz dev", "bd"] },
  { term: "marketing", aliases: ["marketing", "go-to-market", "gtm"] },
  { term: "partnerships", aliases: ["partnership", "partnerships", "partner management"] },
  { term: "sponsorship", aliases: ["sponsorship", "sponsorships", "commercial rights"] },
  { term: "event management", aliases: ["event management", "events", "event operations", "matchday", "production"] },
  { term: "sales", aliases: ["sales", "account management", "client relationship"] },
  { term: "strategy", aliases: ["strategy", "strategic", "transformation"] },
  { term: "commercial", aliases: ["commercial", "revenue", "business analyst"] },
  { term: "finance", aliases: ["finance", "investment", "m&a", "private equity", "asset management"] },
  { term: "product", aliases: ["product", "product management", "product owner"] },
  { term: "data analytics", aliases: ["data", "analytics", "business intelligence", "dashboard", "bi"] },
  { term: "e-commerce", aliases: ["e-commerce", "ecommerce", "marketplace", "merchandising"] }
];

const industryKeywordDefinitions: KeywordDefinition[] = [
  { term: "sports", aliases: ["sport", "sports", "football", "tennis", "club", "league", "federation", "tournament"] },
  { term: "event company", aliases: ["event company", "events company", "event agency"] },
  { term: "consumer brand", aliases: ["consumer brand", "consumer goods", "fmcg"] },
  { term: "luxury", aliases: ["luxury", "fashion", "retail"] },
  { term: "startup", aliases: ["startup", "scaleup", "venture", "founder"] },
  { term: "hospitality", aliases: ["hospitality", "hotel", "tourism", "travel"] },
  { term: "tech", aliases: ["tech", "software", "saas", "digital"] }
];

const sportEventSignals = ["sport", "sports", "sponsorship", "partnership", "partnerships", "events", "event", "federation", "club", "agency", "tournament", "hospitality", "fan experience", "matchday", "football", "tennis"];
const languageNames = ["english", "french", "spanish", "german", "dutch", "italian", "portuguese", "arabic", "chinese", "japanese", "korean"];
const analyticsRoleSignals = ["data analyst", "business intelligence", "bi analyst", "analytics", "reporting analyst", "dashboard", "data science"];
const financeRoleSignals = ["accounting", "audit", "finance", "investment", "m&a", "trading", "risk", "controlling"];
const codingRoleSignals = ["software engineer", "developer", "coding", "python developer", "backend", "frontend", "full stack"];
const marketingBdEventSignals = ["marketing", "brand", "growth", "business development", "sales", "partnership", "sponsorship", "event", "events", "commercial", "activation", "account management"];
const weakAggregatorHosts = ["linkedin.com", "indeed.com", "glassdoor.com", "stage.fr", "jobteaser.com", "welcometothejungle.com", "talent.com", "jooble.org", "simplyhired.com", "monster.com", "google.com", "bing.com"];
const directApplicationHosts = ["greenhouse.io", "lever.co", "workable.com", "teamtailor.com", "smartrecruiters.com", "ashbyhq.com", "factorialhr.com", "myworkdayjobs.com", "workdayjobs.com", "bamboohr.com", "recruitee.com", "personio.com", "homerun.co"];

function readPrompt(fileName: string) {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch {
    return "Find up to 3 high-quality, recent internship leads and return structured JSON only.";
  }
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9&+\-/\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesPhrase(text: string, phrase: string) {
  const normalizedPhrase = normalizeSearchText(phrase);
  return text === normalizedPhrase || text.includes(normalizedPhrase);
}

function extractMatchingTerms(text: string, definitions: KeywordDefinition[]) {
  const normalizedText = normalizeSearchText(text);
  return definitions.filter((definition) => definition.aliases.some((alias) => includesPhrase(normalizedText, alias))).map((definition) => definition.term);
}

function removeAvoidedTerms(terms: string[], thingsToAvoid: string) {
  const avoidedText = normalizeSearchText(thingsToAvoid);
  if (!avoidedText) return terms;
  return terms.filter((term) => !includesPhrase(avoidedText, term));
}

function sanitizeCompanyForQuery(company: string) {
  return company.replace(/["\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

function buildAvoidedCompanySuffix(profile: CandidateProfile) {
  return profile.companiesAlreadyAppliedTo.map(sanitizeCompanyForQuery).filter(Boolean).slice(0, 5).map((company) => `-"${company}"`).join(" ");
}

function extractUsefulKeywords(profile: CandidateProfile) {
  const profileText = [profile.idealInternshipDescription, profile.desiredRoles.join(" "), profile.targetIndustries.join(" "), profile.cvText.slice(0, 1500)].join(" ");
  const roleTerms = removeAvoidedTerms(extractMatchingTerms(profileText, roleKeywordDefinitions), profile.thingsToAvoid).slice(0, 5);
  const industryTerms = removeAvoidedTerms(extractMatchingTerms(profileText, industryKeywordDefinitions), profile.thingsToAvoid).slice(0, 4);
  return { roleTerms, industryTerms, seniorityTerms: ["internship"] };
}

function isSportEventRelated(profile: CandidateProfile, keywords: ReturnType<typeof extractUsefulKeywords>) {
  const text = normalizeSearchText([profile.idealInternshipDescription, profile.desiredRoles.join(" "), profile.targetIndustries.join(" "), profile.cvText.slice(0, 1500), keywords.roleTerms.join(" "), keywords.industryTerms.join(" ")].join(" "));
  return sportEventSignals.some((signal) => includesPhrase(text, signal));
}

function cleanQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

export function buildSearchQueries(profile: CandidateProfile, options: WebInternshipSearchOptions = {}) {
  const pass = options.pass ?? 1;
  const countries = profile.targetCountries.length ? profile.targetCountries : ["international"];
  const cities = profile.targetCities;
  const locations = pass === 1 && cities.length ? cities : pass === 2 ? [...cities, ...countries] : countries;
  const keywords = extractUsefulKeywords(profile);
  const roleTerms = keywords.roleTerms.length ? keywords.roleTerms : profile.desiredRoles.length ? profile.desiredRoles.slice(0, 3) : ["business development", "marketing"];
  const industryTerms = keywords.industryTerms.length ? keywords.industryTerms : profile.targetIndustries.length ? profile.targetIndustries.slice(0, 2) : ["business"];
  const locationKeyword = locations[0] ?? countries[0];
  const atsKeyword = [...roleTerms, ...industryTerms].slice(0, 3).join(" ") || "business internship";
  const avoidedCompanySuffix = buildAvoidedCompanySuffix(profile);
  const hasSportEventIntent = isSportEventRelated(profile, keywords);

  const exactQueries = locations.flatMap((location) => roleTerms.flatMap((role) => industryTerms.slice(0, 2).map((industry) => `${role} internship ${location} ${industry} ${avoidedCompanySuffix}`)));
  const hiddenBoardQueries = ["greenhouse.io", "lever.co", "workable.com", "teamtailor.com", "smartrecruiters.com", "jobs.ashbyhq.com", "myworkdayjobs.com"].map((site) => `site:${site} internship ${atsKeyword} ${locationKeyword}`);
  const conditionalQueries = hasSportEventIntent
    ? [`partnerships internship ${locationKeyword} sports ${avoidedCompanySuffix}`, `sponsorship intern ${locationKeyword} sports agency ${avoidedCompanySuffix}`, `event management internship ${locationKeyword} ${avoidedCompanySuffix}`, `brand activation internship ${locationKeyword} sports ${avoidedCompanySuffix}`]
    : [`marketing internship ${locationKeyword} ${avoidedCompanySuffix}`, `business development internship ${locationKeyword} ${avoidedCompanySuffix}`, `brand management internship ${locationKeyword} ${avoidedCompanySuffix}`, `commercial internship ${locationKeyword} ${avoidedCompanySuffix}`, `partnerships internship ${locationKeyword} ${avoidedCompanySuffix}`];
  const broadenedQueries = pass >= 2 ? locations.flatMap((location) => [`${roleTerms[0] ?? "business"} internship ${location} direct application ${avoidedCompanySuffix}`, `${roleTerms[0] ?? "business"} trainee ${location} business school ${avoidedCompanySuffix}`]) : [];
  const adjacentQueries = pass >= 3 ? countries.flatMap((country) => [`high signal business school internship ${country} ${atsKeyword} ${avoidedCompanySuffix}`, `commercial marketing partnerships internship ${country} direct application ${avoidedCompanySuffix}`, `startup business operations internship ${country} ${atsKeyword} ${avoidedCompanySuffix}`]) : [];
  const retryQueries = options.retryMode ? countries.map((country) => `high signal internship ${country} ${atsKeyword} ${avoidedCompanySuffix}`) : [];

  return Array.from(new Set([...exactQueries, ...hiddenBoardQueries, ...conditionalQueries, ...broadenedQueries, ...adjacentQueries, ...retryQueries].map(cleanQuery).filter(Boolean))).slice(0, 18);
}

function extractText(response: OpenAITextResponse) {
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean).join("\n") ?? "";
}

function assertWebSearchWasUsed(response: OpenAITextResponse) {
  if (!response.output?.some((item) => item.type === "web_search_call")) throw new Error("OpenAI response did not include a web_search_call.");
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return text.slice(start);
}

function repairControlCharactersInJsonStrings(text: string) {
  let repaired = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      repaired += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      repaired += char;
      inString = !inString;
      continue;
    }
    if (inString && char.charCodeAt(0) < 0x20) {
      repaired += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    repaired += char;
  }
  return repaired;
}

function sanitizedPreview(text: string) {
  return text.slice(0, 500).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function captureJsonParseFailure(error: unknown, text: string, context: ParseContext) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("errorType", "json_parse_failed");
    scope.setTag("retry", String(context.retry));
    scope.setContext("premium_live_search_json_parse", { retry: context.retry, queryCount: context.queryCount, targetCountriesCount: context.profile.targetCountries.length, targetCitiesCount: context.profile.targetCities.length, languagesCount: context.profile.languagesSpoken.length, responseLength: text.length, responsePreview: sanitizedPreview(text) });
    Sentry.captureException(error);
  });
}

function parseJsonObject(text: string) {
  const stripped = stripMarkdownFence(text);
  const candidates = Array.from(new Set([stripped, extractFirstJsonObject(stripped)]));
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };
    } catch (error) {
      lastError = error;
      try {
        return JSON.parse(repairControlCharactersInJsonStrings(candidate)) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };
      } catch (repairError) {
        lastError = repairError;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("JSON parse failed.");
}

function parseOffers(text: string, context: ParseContext) {
  try {
    const parsed = parseJsonObject(text);
    if (!Array.isArray(parsed.offers)) throw new Error("OpenAI response did not include an offers array.");
    return parsed.offers;
  } catch (error) {
    captureJsonParseFailure(error, text, context);
    throw new Error("Premium search JSON parsing failed.");
  }
}

function normalizeOffers(offers: Array<Omit<ScoredInternshipOffer, "id">>, pass: SearchPass): ScoredInternshipOffer[] {
  return offers.slice(0, 3).map((offer, index) => ({ id: `premium_offer_${Date.now()}_${pass}_${index + 1}`, ...offer, isPremium: true }));
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matchesHost(host: string, domains: string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isWeakAggregatorOffer(offer: ScoredInternshipOffer) {
  const host = getHostname(offer.url);
  const source = offer.source.toLowerCase();
  if (!host) return true;
  if (matchesHost(host, weakAggregatorHosts)) return true;
  return weakAggregatorHosts.some((domain) => source.includes(domain.replace(/\.com|\.org|\.fr/g, "")));
}

function isDirectApplicationOffer(offer: ScoredInternshipOffer) {
  const host = getHostname(offer.url);
  if (!host) return false;
  if (matchesHost(host, directApplicationHosts)) return true;
  return /careers?|jobs?|job-detail|positions?|openings?|vacancies?|internship|apply/i.test(offer.url);
}

function normalizeList(values: string[]) {
  return values.map((value) => normalizeSearchText(value)).filter(Boolean);
}

function offerText(offer: ScoredInternshipOffer) {
  return normalizeSearchText([offer.title, offer.company, offer.location, offer.country, offer.city, offer.source, offer.descriptionSummary, offer.requirementsSummary, offer.compensation, offer.languageRequirements.join(" "), offer.rawSourceSnippet, offer.languageFit, offer.whyItMatches.join(" "), offer.risks.join(" ")].join(" "));
}

function explicitRequiredLanguages(offer: ScoredInternshipOffer) {
  const text = offerText(offer);
  const listedLanguages = normalizeList(offer.languageRequirements);
  return languageNames.filter((language) => listedLanguages.includes(language) || (text.includes(language) && /(required|native|fluent|professional|mandatory|must|bilingual)/.test(text)));
}

function isLanguageCompatible(offer: ScoredInternshipOffer, profile: CandidateProfile) {
  const spoken = normalizeList(profile.languagesSpoken);
  if (!spoken.length) return { compatible: false, reason: "missing_candidate_languages" };
  const missing = explicitRequiredLanguages(offer).filter((language) => !spoken.includes(language));
  if (missing.length) return { compatible: false, reason: `language_mismatch_${missing.join("_")}` };
  return { compatible: true, reason: "language_compatible" };
}

function hasAvoidedSignal(offer: ScoredInternshipOffer, profile: CandidateProfile) {
  const avoid = normalizeSearchText(profile.thingsToAvoid);
  if (!avoid) return false;
  const text = offerText(offer);
  return avoid.split(/[,;\n]|\band\b|\bor\b/).map((item) => item.trim()).filter((item) => item.length > 2).some((term) => includesPhrase(text, term) || text.includes(term));
}

function isAlreadyAppliedCompany(offer: ScoredInternshipOffer, profile: CandidateProfile) {
  const company = normalizeSearchText(offer.company);
  return normalizeList(profile.companiesAlreadyAppliedTo).some((applied) => applied && (company.includes(applied) || applied.includes(company)));
}

function hasPastDeadline(offer: ScoredInternshipOffer) {
  if (!offer.deadline || /not listed|unknown|rolling/i.test(offer.deadline)) return false;
  const timestamp = Date.parse(offer.deadline);
  return Number.isFinite(timestamp) && timestamp < Date.now() - 24 * 60 * 60 * 1000;
}

function violatesExplicitDuration(offer: ScoredInternshipOffer, profile: CandidateProfile) {
  const avoid = normalizeSearchText(profile.thingsToAvoid);
  const text = offerText(offer);
  return avoid.includes("longer than 6 months") && /\b(12|18|24)\s*months?\b/.test(text);
}

function isRoleCompatible(offer: ScoredInternshipOffer, profile: CandidateProfile) {
  const intent = normalizeSearchText([profile.desiredRoles.join(" "), profile.idealInternshipDescription, profile.cvText.slice(0, 1500)].join(" "));
  const text = offerText(offer);
  if (hasAvoidedSignal(offer, profile)) return { compatible: false, reason: "matches_things_to_avoid" };
  const wantsMarketingBdEvents = marketingBdEventSignals.some((signal) => includesPhrase(intent, signal));
  const isOffFamily = [...analyticsRoleSignals, ...financeRoleSignals, ...codingRoleSignals].some((signal) => includesPhrase(text, signal));
  if (wantsMarketingBdEvents && isOffFamily && !marketingBdEventSignals.some((signal) => includesPhrase(text, signal))) return { compatible: false, reason: "role_family_mismatch" };
  return { compatible: true, reason: "role_compatible" };
}

function validatePremiumOffer(offer: ScoredInternshipOffer, profile: CandidateProfile): ValidationResult {
  if (!offer.title || !offer.company) return { offer, rejection: "missing_title_or_company" };
  if (!offer.url || isWeakAggregatorOffer(offer) || !isDirectApplicationOffer(offer)) return { offer, rejection: "weak_or_non_direct_url" };
  if (hasPastDeadline(offer)) return { offer, rejection: "past_deadline" };
  if (isAlreadyAppliedCompany(offer, profile)) return { offer, rejection: "already_applied_company" };
  if (violatesExplicitDuration(offer, profile)) return { offer, rejection: "duration_excluded" };
  const language = isLanguageCompatible(offer, profile);
  if (!language.compatible) return { offer, rejection: language.reason };
  const role = isRoleCompatible(offer, profile);
  if (!role.compatible) return { offer, rejection: role.reason };
  if ((offer.matchType === "exact" || offer.matchType === "close") && offer.matchScore < 70) return { offer, rejection: "low_match_score" };
  const matchScore = offer.matchType === "broadened" ? Math.min(offer.matchScore, 78) : offer.matchScore;
  return { offer: { ...offer, matchScore: Math.round(matchScore), qualityScore: Math.round(offer.qualityScore), isPremium: true } };
}

function normalizedUrlKey(offer: ScoredInternshipOffer) {
  try {
    const url = new URL(offer.url);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return normalizeSearchText(offer.url);
  }
}

function companyTitleKey(offer: ScoredInternshipOffer) {
  return `${normalizeSearchText(offer.company)}::${normalizeSearchText(offer.title).replace(/\b(internship|intern|stage|trainee|student|m f d|f m|h f)\b/g, "").trim()}`;
}

function dedupeOffers(offers: ScoredInternshipOffer[]) {
  const seen = new Set<string>();
  const deduped: ScoredInternshipOffer[] = [];
  for (const offer of offers.sort((a, b) => b.matchScore + b.qualityScore - (a.matchScore + a.qualityScore))) {
    const keys = [normalizedUrlKey(offer), companyTitleKey(offer)];
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    deduped.push(offer);
  }
  return deduped;
}

function resultMeetsMinimumThreshold(offers: ScoredInternshipOffer[]) {
  if (offers.length >= 2) return true;
  if (offers.length !== 1) return false;
  const offer = offers[0];
  return (offer.matchType === "exact" || offer.matchType === "close") && offer.matchScore >= 85 && offer.qualityScore >= 80 && isDirectApplicationOffer(offer) && !isWeakAggregatorOffer(offer);
}

function rejectionSummary(rejections: Rejection[]) {
  return rejections.reduce<Record<string, number>>((summary, rejection) => {
    summary[rejection.reason] = (summary[rejection.reason] ?? 0) + 1;
    return summary;
  }, {});
}

function captureOpenAIRequestFailure(error: unknown, profile: CandidateProfile, model: string, queryCount: number, options: WebInternshipSearchOptions = {}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("model", model);
    scope.setTag("retry", String(Boolean(options.retryMode)));
    scope.setContext("premium_live_search_openai_failure", { model, queryCount, retry: Boolean(options.retryMode), pass: options.pass ?? 1, targetCountriesCount: profile.targetCountries.length, targetCitiesCount: profile.targetCities.length, languagesCount: profile.languagesSpoken.length });
    Sentry.captureException(error);
  });
}

async function runOpenAIPass(profile: CandidateProfile, cvText: string, model: string, researchPrompt: string, scoringPrompt: string, options: WebInternshipSearchOptions, pass: SearchPass) {
  const queries = buildSearchQueries(profile, { ...options, pass });
  let response: OpenAITextResponse;
  try {
    response = await createOpenAIResponse<OpenAITextResponse>({
      model,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      text: { format: outputSchema },
      input: [
        { role: "system", content: `${researchPrompt}\n\n${scoringPrompt}` },
        {
          role: "user",
          content: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            searchPass: pass,
            candidateProfile: profile,
            cvText,
            suggestedQueries: queries,
            retryMode: Boolean(options.retryMode),
            passGuidance: pass === 1 ? "Pass 1: exact target roles and target cities/countries." : pass === 2 ? "Pass 2: broaden to same-country hubs and adjacent roles in the same career family. Keep language strict." : "Pass 3: final controlled broadening. Still reject language-incompatible, role-incompatible, expired, LinkedIn, aggregator or filler results.",
            requiredOutput: "Aim to return 3 paid-quality leads. If fewer than 3 exact matches exist, broaden gradually, but do not include language-incompatible or clearly role-incompatible filler."
          }, null, 2)
        }
      ]
    });
  } catch (error) {
    captureOpenAIRequestFailure(error, profile, model, queries.length, { ...options, pass });
    throw error;
  }

  assertWebSearchWasUsed(response);
  const text = extractText(response);
  const parsedOffers = normalizeOffers(parseOffers(text, { profile, queryCount: queries.length, retry: Boolean(options.retryMode) }), pass);
  const rejections: Rejection[] = [];
  const kept: ScoredInternshipOffer[] = [];
  for (const offer of parsedOffers) {
    const result = validatePremiumOffer(offer, profile);
    if (result.rejection) rejections.push({ reason: result.rejection, title: offer.title, company: offer.company, url: offer.url, matchType: offer.matchType });
    else kept.push(result.offer);
  }
  return { pass, queries, rawResponse: text, parsedOfferCount: parsedOffers.length, kept, rejections };
}

function captureMultiPassDiagnostics(profile: CandidateProfile, model: string, diagnostics: PassDiagnostic[], finalOfferCount: number, options: WebInternshipSearchOptions) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("model", model);
    scope.setTag("retry", String(Boolean(options.retryMode)));
    scope.setContext("premium_live_search_multi_pass", { passCount: diagnostics.length, passes: diagnostics, finalOfferCount, targetCountriesCount: profile.targetCountries.length, targetCitiesCount: profile.targetCities.length, languagesCount: profile.languagesSpoken.length });
    Sentry.captureMessage("Premium live search multi-pass completed", finalOfferCount >= 2 ? "info" : "warning");
  });
}

export async function webInternshipSearch(profile: CandidateProfile, cvText: string, options: WebInternshipSearchOptions = {}) {
  if (!hasOpenAIConfig()) {
    if (process.env.NODE_ENV === "production") throw new Error("OPENAI_API_KEY is not configured in production.");
    return { offers: mockOffers.filter((offer) => offer.isPremium).slice(0, 3), querySummary: buildSearchQueries(profile, options).join("; "), rawResponse: "Mock response because OPENAI_API_KEY is not configured." };
  }

  const researchPrompt = readPrompt("internship-web-search.md");
  const scoringPrompt = readPrompt("job-scoring.md");
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const collected: ScoredInternshipOffer[] = [];
  const diagnostics: PassDiagnostic[] = [];
  const rawResponses: string[] = [];
  const querySummaries: string[] = [];

  for (const pass of [1, 2, 3] as SearchPass[]) {
    const result = await runOpenAIPass(profile, cvText, model, researchPrompt, scoringPrompt, options, pass);
    rawResponses.push(`Pass ${pass}:\n${result.rawResponse}`);
    querySummaries.push(`Pass ${pass}: ${result.queries.join("; ")}`);
    collected.push(...result.kept);
    const deduped = dedupeOffers(collected).slice(0, 3);
    collected.length = 0;
    collected.push(...deduped);
    diagnostics.push({ pass, parsedOfferCount: result.parsedOfferCount, keptOfferCount: result.kept.length, rejectionReasons: rejectionSummary(result.rejections) });
    if (collected.length >= 3 || (pass >= 2 && resultMeetsMinimumThreshold(collected))) break;
  }

  const offers = dedupeOffers(collected).slice(0, 3);
  captureMultiPassDiagnostics(profile, model, diagnostics, offers.length, options);
  if (!offers.length) throw new Error("No language-compatible premium internship leads were found after multi-pass search. Please broaden the search criteria or retry manually.");
  if (!resultMeetsMinimumThreshold(offers)) throw new Error("Premium search found only one weak or insufficiently compatible lead after multi-pass search.");
  return { offers, querySummary: querySummaries.join("\n"), rawResponse: rawResponses.join("\n\n---\n\n") };
}
