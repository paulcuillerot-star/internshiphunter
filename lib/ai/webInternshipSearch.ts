import "server-only";
import * as Sentry from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";
import { createOpenAIResponse, hasOpenAIConfig } from "@/lib/openai";
import { mockOffers } from "@/lib/mockData";
import type { CandidateProfile, PremiumSearchBrief, ScoredInternshipOffer } from "@/lib/types";

type OpenAITextResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type WebInternshipSearchOptions = { retryMode?: boolean };
type ParseContext = { profile: CandidateProfile; queryCount: number; retry: boolean };

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
          required: [
            "title",
            "company",
            "location",
            "country",
            "city",
            "url",
            "source",
            "deadline",
            "publishedDate",
            "descriptionSummary",
            "requirementsSummary",
            "compensation",
            "languageRequirements",
            "rawSourceSnippet",
            "matchScore",
            "qualityScore",
            "probabilityOfInterview",
            "whyItMatches",
            "risks",
            "applicationAngle",
            "linkedinMessage",
            "coverLetterHook",
            "matchType",
            "broadenedReason",
            "languageFit",
            "isPremium"
          ]
        }
      }
    },
    required: ["offers"]
  }
};

const weakAggregatorHosts = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "stage.fr",
  "jobteaser.com",
  "welcometothejungle.com",
  "talent.com",
  "jooble.org",
  "simplyhired.com",
  "monster.com",
  "google.com",
  "bing.com"
];

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

const sportEventSignals = ["sport", "sports", "sponsorship", "partnership", "partnerships", "events", "event", "federation", "club", "agency", "tournament", "hospitality", "fan experience", "matchday", "football", "tennis"];

function readPrompt(fileName: string) {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch {
    return "Find up to 3 high-quality, recent internship leads and return structured JSON only.";
  }
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9&+\-/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

function sanitizeCompanyForQuery(company: string) {
  return company.replace(/["\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

function buildAvoidedCompanySuffix(profile: CandidateProfile, searchBrief: PremiumSearchBrief) {
  const companies = unique([...profile.companiesAlreadyAppliedTo, ...searchBrief.companiesAlreadyAppliedTo]).map(sanitizeCompanyForQuery).filter(Boolean).slice(0, 4);
  return companies.map((company) => `-"${company}"`).join(" ");
}

function fallbackSearchBrief(profile: CandidateProfile): PremiumSearchBrief {
  return {
    targetRoles: profile.desiredRoles,
    rolePriority: profile.desiredRoles,
    targetIndustries: profile.targetIndustries,
    strictCities: profile.targetCities,
    acceptableCountries: profile.targetCountries,
    remoteAccepted: false,
    languages: profile.languagesSpoken.map((language) => ({ language, level: "Working proficiency" })),
    internshipStartDate: profile.internshipStartDate,
    internshipDuration: profile.internshipDuration,
    durationStrictness: "flexible",
    companiesAlreadyAppliedTo: profile.companiesAlreadyAppliedTo,
    hardFilters: profile.thingsToAvoid ? [profile.thingsToAvoid] : [],
    softPreferences: [],
    broadeningOrder: ["nearby cities", "adjacent roles", "nearby countries", "broader high-signal companies"],
    profileSummary: profile.cvText,
    idealInternshipDescription: profile.idealInternshipDescription
  };
}

function getSearchBrief(profile: CandidateProfile) {
  return profile.premiumSearchBrief ?? fallbackSearchBrief(profile);
}

function extractBriefKeywords(searchBrief: PremiumSearchBrief) {
  const roleTerms = unique([...searchBrief.rolePriority, ...searchBrief.targetRoles]).slice(0, 6);
  const industryTerms = unique(searchBrief.targetIndustries).slice(0, 4);
  const locations = unique([...searchBrief.strictCities, ...searchBrief.acceptableCountries]).slice(0, 6);
  const broadeningTerms = searchBrief.broadeningOrder.slice(0, 4);
  const hardFilterText = searchBrief.hardFilters.join(" ");

  return {
    roleTerms: roleTerms.length ? roleTerms : ["business internship"],
    industryTerms: industryTerms.length ? industryTerms : ["business"],
    locations: locations.length ? locations : ["Europe"],
    broadeningTerms,
    hardFilterText
  };
}

function isSportEventRelated(profile: CandidateProfile, searchBrief: PremiumSearchBrief) {
  const text = normalizeSearchText(
    [
      searchBrief.idealInternshipDescription,
      searchBrief.targetRoles.join(" "),
      searchBrief.rolePriority.join(" "),
      searchBrief.targetIndustries.join(" "),
      searchBrief.softPreferences.join(" "),
      profile.idealInternshipDescription,
      profile.cvText.slice(0, 1200)
    ].join(" ")
  );

  return sportEventSignals.some((signal) => text.includes(normalizeSearchText(signal)));
}

export function buildSearchQueries(profile: CandidateProfile, options: WebInternshipSearchOptions = {}) {
  const searchBrief = getSearchBrief(profile);
  const keywords = extractBriefKeywords(searchBrief);
  const roleTerms = keywords.roleTerms;
  const industryTerms = keywords.industryTerms;
  const locations = keywords.locations;
  const avoidedCompanySuffix = buildAvoidedCompanySuffix(profile, searchBrief);
  const hasSportEventIntent = isSportEventRelated(profile, searchBrief);

  const exactQueries = locations.flatMap((location) =>
    roleTerms.slice(0, 4).flatMap((role) => [
      `${role} internship ${location} direct application ${avoidedCompanySuffix}`,
      `${role} intern ${location} ${industryTerms[0] ?? "business"} ${avoidedCompanySuffix}`
    ])
  );

  const industryQueries = locations.flatMap((location) =>
    industryTerms.slice(0, 3).flatMap((industry) => roleTerms.slice(0, 3).map((role) => `${role} internship ${location} ${industry} ${avoidedCompanySuffix}`))
  );

  const atsKeyword = unique([...roleTerms, ...industryTerms]).slice(0, 4).join(" ") || "business internship";
  const locationKeyword = locations[0] ?? "Europe";
  const hiddenBoardQueries = [
    `site:greenhouse.io internship ${atsKeyword} ${locationKeyword}`,
    `site:lever.co internship ${atsKeyword} ${locationKeyword}`,
    `site:workable.com internship ${atsKeyword} ${locationKeyword}`,
    `site:teamtailor.com internship ${atsKeyword} ${locationKeyword}`,
    `site:smartrecruiters.com internship ${atsKeyword} ${locationKeyword}`,
    `site:jobs.ashbyhq.com internship ${atsKeyword} ${locationKeyword}`
  ];

  const conditionalQueries = hasSportEventIntent
    ? [
        `partnerships internship ${locationKeyword} sports ${avoidedCompanySuffix}`,
        `sponsorship intern ${locationKeyword} sports agency ${avoidedCompanySuffix}`,
        `event management internship ${locationKeyword} ${avoidedCompanySuffix}`,
        `brand activation internship ${locationKeyword} sports ${avoidedCompanySuffix}`,
        `commercial partnerships intern ${locationKeyword} ${avoidedCompanySuffix}`
      ]
    : [
        `marketing internship ${locationKeyword} ${avoidedCompanySuffix}`,
        `business development internship ${locationKeyword} ${avoidedCompanySuffix}`,
        `brand management internship ${locationKeyword} ${avoidedCompanySuffix}`,
        `commercial internship ${locationKeyword} ${avoidedCompanySuffix}`,
        `strategy internship ${locationKeyword} ${avoidedCompanySuffix}`
      ];

  const retryQueries = options.retryMode
    ? searchBrief.broadeningOrder.flatMap((broadening) =>
        locations.slice(0, 3).map((location) => `${roleTerms[0] ?? "business"} internship ${location} ${broadening} ${industryTerms[0] ?? "business"} ${avoidedCompanySuffix}`)
      )
    : [];

  return Array.from(new Set([...exactQueries, ...industryQueries, ...hiddenBoardQueries, ...conditionalQueries, ...retryQueries].map(cleanQuery).filter(Boolean))).slice(0, 18);
}

function extractText(response: OpenAITextResponse) {
  if (response.output_text) return response.output_text;

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function assertWebSearchWasUsed(response: OpenAITextResponse) {
  const usedWebSearch = response.output?.some((item) => item.type === "web_search_call");

  if (!usedWebSearch) {
    throw new Error("OpenAI response did not include a web_search_call.");
  }
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
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

function escapeControlCharacter(char: string) {
  if (char === "\n") return "\\n";
  if (char === "\r") return "\\r";
  if (char === "\t") return "\\t";
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
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
      repaired += escapeControlCharacter(char);
      continue;
    }

    repaired += char;
  }

  return repaired;
}

function sanitizedPreview(text: string) {
  return text
    .slice(0, 500)
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function captureJsonParseFailure(error: unknown, text: string, context: ParseContext) {
  const message = error instanceof Error ? error.message : "Unknown JSON parse error";
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("errorType", "json_parse_failed");
    scope.setTag("retry", String(context.retry));
    scope.setContext("premium_live_search_json_parse", {
      errorMessage: message,
      retry: context.retry,
      queryCount: context.queryCount,
      targetCountriesCount: context.profile.targetCountries.length,
      targetCitiesCount: context.profile.targetCities.length,
      languagesCount: context.profile.languagesSpoken.length,
      responseLength: text.length,
      responsePreview: sanitizedPreview(text)
    });
    Sentry.captureException(error);
  });
}

function tryParseJsonObject(text: string) {
  try {
    return JSON.parse(text) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };
  } catch {
    const repaired = repairControlCharactersInJsonStrings(text);
    if (repaired === text) throw new Error("JSON parse failed before repair.");
    return JSON.parse(repaired) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };
  }
}

function parseJsonObject(text: string) {
  const stripped = stripMarkdownFence(text);
  const candidates = Array.from(new Set([stripped, extractFirstJsonObject(stripped)]));
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return tryParseJsonObject(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("JSON parse failed.");
}

function parseOffers(text: string, context: ParseContext) {
  try {
    const parsed = parseJsonObject(text) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };

    if (!Array.isArray(parsed.offers)) {
      throw new Error("OpenAI response did not include an offers array.");
    }

    return parsed.offers;
  } catch (error) {
    captureJsonParseFailure(error, text, context);
    throw new Error("Premium search JSON parsing failed.");
  }
}

function normalizeOffers(offers: Array<Omit<ScoredInternshipOffer, "id">>): ScoredInternshipOffer[] {
  return offers.slice(0, 3).map((offer, index) => ({
    id: `premium_offer_${Date.now()}_${index + 1}`,
    ...offer,
    isPremium: true
  }));
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

function filterPremiumSourceQuality(offers: ScoredInternshipOffer[]) {
  return offers.filter((offer) => !isWeakAggregatorOffer(offer) && isDirectApplicationOffer(offer));
}

function captureOpenAIRequestFailure(error: unknown, profile: CandidateProfile, model: string, queryCount: number, options: WebInternshipSearchOptions = {}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("model", model);
    scope.setTag("retry", String(Boolean(options.retryMode)));
    scope.setContext("premium_live_search_openai_failure", {
      model,
      queryCount,
      retry: Boolean(options.retryMode),
      targetCountriesCount: profile.targetCountries.length,
      targetCitiesCount: profile.targetCities.length,
      languagesCount: profile.languagesSpoken.length,
      hasSearchBrief: Boolean(profile.premiumSearchBrief)
    });
    Sentry.captureException(error);
  });
}

export async function webInternshipSearch(profile: CandidateProfile, cvText: string, options: WebInternshipSearchOptions = {}) {
  const searchBrief = getSearchBrief(profile);

  if (!hasOpenAIConfig()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OPENAI_API_KEY is not configured in production.");
    }

    return {
      offers: mockOffers.filter((offer) => offer.isPremium).slice(0, 3),
      querySummary: buildSearchQueries(profile, options).join("; "),
      rawResponse: "Mock response because OPENAI_API_KEY is not configured."
    };
  }

  const researchPrompt = readPrompt("internship-web-search.md");
  const scoringPrompt = readPrompt("job-scoring.md");
  const queries = buildSearchQueries(profile, options);
  const model = process.env.OPENAI_MODEL || "gpt-5";

  let response: OpenAITextResponse;
  try {
    response = await createOpenAIResponse<OpenAITextResponse>({
      model,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      text: {
        format: outputSchema
      },
      input: [
        {
          role: "system",
          content: `${researchPrompt}\n\n${scoringPrompt}`
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              today: new Date().toISOString().slice(0, 10),
              candidateProfile: profile,
              searchBrief,
              cvText,
              suggestedQueries: queries,
              retryMode: Boolean(options.retryMode),
              hardFilterInstruction:
                "Follow searchBrief.hardFilters strictly. Do not include roles matching those exclusions, companies already applied to, incompatible language requirements, expired postings, senior roles, full-time permanent roles, LinkedIn URLs, generic careers pages or weak aggregators.",
              broadeningInstruction:
                "If exact matches are limited, broaden only according to searchBrief.broadeningOrder. Never broaden language compatibility. Explain every broadened result in broadenedReason.",
              retryGuidance: options.retryMode
                ? "This is a retry after no strong leads or a recoverable search failure. Broaden softly according to searchBrief.broadeningOrder, but keep language compatibility and hard filters strict. Prefer 1-2 strong compatible leads over weak matches."
                : "",
              requiredOutput:
                "Return up to 3 paid-quality premium internship leads. Aim for 2-3 useful direct employer or ATS leads. If no valid compatible opportunities exist, return an empty offers array."
            },
            null,
            2
          )
        }
      ]
    });
  } catch (error) {
    captureOpenAIRequestFailure(error, profile, model, queries.length, options);
    throw error;
  }

  assertWebSearchWasUsed(response);
  const text = extractText(response);
  const parsedOffers = normalizeOffers(parseOffers(text, { profile, queryCount: queries.length, retry: Boolean(options.retryMode) }));
  const offers = filterPremiumSourceQuality(parsedOffers);

  if (parsedOffers.length > 0 && !offers.length) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-live-search");
      scope.setTag("model", model);
      scope.setTag("retry", String(Boolean(options.retryMode)));
      scope.setContext("premium_live_search_source_quality", {
        parsedOfferCount: parsedOffers.length,
        keptOfferCount: offers.length,
        rejectedSources: parsedOffers.map((offer) => ({ source: offer.source, host: getHostname(offer.url) })).slice(0, 5),
        queryCount: queries.length,
        retry: Boolean(options.retryMode),
        model
      });
      Sentry.captureMessage("Premium live search found only weak aggregator or job-board results", "warning");
    });
    throw new Error("Premium search found only weak aggregator or job-board results.");
  }

  if (!offers.length) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-live-search");
      scope.setTag("model", model);
      scope.setTag("retry", String(Boolean(options.retryMode)));
      scope.setContext("premium_live_search_empty", {
        desiredRoles: profile.desiredRoles,
        targetCountriesCount: profile.targetCountries.length,
        targetCitiesCount: profile.targetCities.length,
        languagesCount: profile.languagesSpoken.length,
        targetRolesCount: searchBrief.targetRoles.length,
        hardFiltersCount: searchBrief.hardFilters.length,
        queryCount: queries.length,
        retry: Boolean(options.retryMode),
        model
      });
      Sentry.captureMessage("Premium live search returned zero valid opportunities", "warning");
    });
    throw new Error("No language-compatible premium internship leads were found. Please broaden the search criteria or retry manually.");
  }

  return {
    offers,
    querySummary: queries.join("; "),
    rawResponse: text
  };
}
