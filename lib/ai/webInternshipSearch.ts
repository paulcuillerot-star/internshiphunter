import "server-only";
import * as Sentry from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";
import { createOpenAIResponse, hasOpenAIConfig } from "@/lib/openai";
import { mockOffers } from "@/lib/mockData";
import type { CandidateProfile, ScoredInternshipOffer } from "@/lib/types";

type OpenAITextResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type KeywordDefinition = { term: string; aliases: string[] };

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

const roleKeywordDefinitions: KeywordDefinition[] = [
  { term: "business development", aliases: ["business development", "biz dev", "bd"] },
  { term: "marketing", aliases: ["marketing", "go-to-market", "gtm"] },
  { term: "partnerships", aliases: ["partnership", "partnerships", "partner management"] },
  { term: "sponsorship", aliases: ["sponsorship", "sponsorships", "commercial rights"] },
  { term: "event management", aliases: ["event management", "events", "event operations", "matchday", "production"] },
  { term: "operations", aliases: ["operations", "ops", "project operations"] },
  { term: "strategy", aliases: ["strategy", "strategic", "transformation"] },
  { term: "sales", aliases: ["sales", "account management", "client relationship"] },
  { term: "brand activation", aliases: ["brand activation", "activation", "brand management"] },
  { term: "commercial", aliases: ["commercial", "revenue", "business analyst"] },
  { term: "consulting", aliases: ["consulting", "consultant", "analyst"] },
  { term: "finance", aliases: ["finance", "investment", "m&a", "private equity", "asset management"] },
  { term: "product", aliases: ["product", "product management", "product owner"] },
  { term: "data analytics", aliases: ["data", "analytics", "business intelligence", "dashboard", "bi"] },
  { term: "e-commerce", aliases: ["e-commerce", "ecommerce", "marketplace", "merchandising"] }
];

const industryKeywordDefinitions: KeywordDefinition[] = [
  { term: "sports agency", aliases: ["sports agency", "sport agency"] },
  { term: "sports", aliases: ["sport", "sports", "football", "tennis", "club", "league", "federation", "tournament"] },
  { term: "event company", aliases: ["event company", "events company", "event agency"] },
  { term: "consumer brand", aliases: ["consumer brand", "consumer goods", "fmcg"] },
  { term: "luxury", aliases: ["luxury", "fashion", "retail"] },
  { term: "startup", aliases: ["startup", "scaleup", "venture", "founder"] },
  { term: "hospitality", aliases: ["hospitality", "hotel", "tourism", "travel"] },
  { term: "tech", aliases: ["tech", "software", "saas", "digital"] }
];

const seniorityKeywordDefinitions: KeywordDefinition[] = [
  { term: "internship", aliases: ["internship", "intern", "stage"] },
  { term: "trainee", aliases: ["trainee", "graduate trainee"] },
  { term: "student placement", aliases: ["student placement", "placement", "working student"] }
];

const sportEventSignals = [
  "sport",
  "sports",
  "sponsorship",
  "partnership",
  "partnerships",
  "events",
  "event",
  "federation",
  "club",
  "agency",
  "tournament",
  "hospitality",
  "fan experience",
  "matchday",
  "football",
  "tennis"
];

function readPrompt(fileName: string) {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch {
    return "Find up to 3 high-quality, recent internship leads and return structured JSON only.";
  }
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

function includesPhrase(text: string, phrase: string) {
  const normalizedPhrase = normalizeSearchText(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${normalizedPhrase}(\\s|$)`).test(text);
}

function extractMatchingTerms(text: string, definitions: KeywordDefinition[]) {
  const normalizedText = normalizeSearchText(text);
  return definitions
    .filter((definition) => definition.aliases.some((alias) => includesPhrase(normalizedText, alias)))
    .map((definition) => definition.term);
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
  const companies = profile.companiesAlreadyAppliedTo.map(sanitizeCompanyForQuery).filter(Boolean).slice(0, 3);
  return companies.map((company) => `-"${company}"`).join(" ");
}

function extractUsefulKeywords(profile: CandidateProfile) {
  const idealText = profile.idealInternshipDescription ?? "";
  const profileText = [
    idealText,
    profile.desiredRoles.join(" "),
    profile.targetIndustries.join(" "),
    profile.cvText.slice(0, 1500)
  ].join(" ");

  const roleTerms = removeAvoidedTerms(extractMatchingTerms(profileText, roleKeywordDefinitions), profile.thingsToAvoid).slice(0, 5);
  const industryTerms = removeAvoidedTerms(extractMatchingTerms(profileText, industryKeywordDefinitions), profile.thingsToAvoid).slice(0, 4);
  const seniorityTerms = extractMatchingTerms(profileText, seniorityKeywordDefinitions).slice(0, 2);

  return {
    roleTerms,
    industryTerms,
    seniorityTerms: seniorityTerms.length ? seniorityTerms : ["internship"]
  };
}

function isSportEventRelated(profile: CandidateProfile, keywords: ReturnType<typeof extractUsefulKeywords>) {
  const text = normalizeSearchText(
    [
      profile.idealInternshipDescription,
      profile.desiredRoles.join(" "),
      profile.targetIndustries.join(" "),
      profile.cvText.slice(0, 1500),
      keywords.roleTerms.join(" "),
      keywords.industryTerms.join(" ")
    ].join(" ")
  );

  return sportEventSignals.some((signal) => includesPhrase(text, signal));
}

function cleanQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

export function buildSearchQueries(profile: CandidateProfile) {
  const countries = profile.targetCountries.length ? profile.targetCountries : ["international"];
  const cities = profile.targetCities;
  const locations = cities.length ? cities : countries;
  const keywords = extractUsefulKeywords(profile);
  const roleTerms = keywords.roleTerms.length ? keywords.roleTerms : profile.desiredRoles.length ? profile.desiredRoles.slice(0, 3) : ["business"];
  const industryTerms = keywords.industryTerms.length ? keywords.industryTerms : profile.targetIndustries.length ? profile.targetIndustries.slice(0, 2) : ["business"];
  const seniority = keywords.seniorityTerms[0] ?? "internship";
  const avoidedCompanySuffix = buildAvoidedCompanySuffix(profile);
  const hasSportEventIntent = isSportEventRelated(profile, keywords);

  const targetedQueries = locations.flatMap((location) =>
    roleTerms.flatMap((role) => [
      `${role} internship ${location} ${industryTerms[0] ?? "business"} ${avoidedCompanySuffix}`,
      `${role} intern ${location} direct application ${avoidedCompanySuffix}`
    ])
  );

  const idealDrivenQueries = locations.flatMap((location) =>
    roleTerms.slice(0, 4).flatMap((role) =>
      industryTerms.slice(0, 3).map((industry) => `${role} ${seniority} ${location} ${industry} ${avoidedCompanySuffix}`)
    )
  );

  const atsKeyword = [...roleTerms, ...industryTerms].slice(0, 3).join(" ") || "business internship";
  const locationKeyword = locations[0] ?? countries[0];
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

  return Array.from(new Set([...idealDrivenQueries, ...targetedQueries, ...hiddenBoardQueries, ...conditionalQueries].map(cleanQuery).filter(Boolean))).slice(0, 18);
}

function extractText(response: OpenAITextResponse) {
  if (response.output_text) {
    return response.output_text;
  }

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

function parseOffers(text: string) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim()
    : trimmed;

  const parsed = JSON.parse(jsonText) as { offers?: Array<Omit<ScoredInternshipOffer, "id">> };

  if (!Array.isArray(parsed.offers)) {
    throw new Error("OpenAI response did not include an offers array.");
  }

  return parsed.offers;
}

function normalizeOffers(offers: Array<Omit<ScoredInternshipOffer, "id">>): ScoredInternshipOffer[] {
  return offers.slice(0, 3).map((offer, index) => ({
    id: `premium_offer_${Date.now()}_${index + 1}`,
    ...offer,
    isPremium: true
  }));
}

function captureOpenAIRequestFailure(error: unknown, profile: CandidateProfile, model: string, queryCount: number) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-live-search");
    scope.setTag("model", model);
    scope.setContext("premium_live_search_openai_failure", {
      model,
      queryCount,
      targetCountriesCount: profile.targetCountries.length,
      targetCitiesCount: profile.targetCities.length,
      languagesCount: profile.languagesSpoken.length
    });
    Sentry.captureException(error);
  });
}

export async function webInternshipSearch(profile: CandidateProfile, cvText: string) {
  if (!hasOpenAIConfig()) {
    return {
      offers: mockOffers.filter((offer) => offer.isPremium).slice(0, 3),
      querySummary: buildSearchQueries(profile).join("; "),
      rawResponse: "Mock response because OPENAI_API_KEY is not configured."
    };
  }

  const researchPrompt = readPrompt("internship-web-search.md");
  const scoringPrompt = readPrompt("job-scoring.md");
  const queries = buildSearchQueries(profile);
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
              cvText,
              suggestedQueries: queries,
              requiredOutput: "Return up to 3 premium internship leads. Prefer 2 strong language-compatible leads over 3 weak or incompatible leads. If no valid compatible opportunities exist, return an empty offers array."
            },
            null,
            2
          )
        }
      ]
    });
  } catch (error) {
    captureOpenAIRequestFailure(error, profile, model, queries.length);
    throw error;
  }

  assertWebSearchWasUsed(response);
  const text = extractText(response);
  const offers = normalizeOffers(parseOffers(text));

  if (!offers.length) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-live-search");
      scope.setTag("model", model);
      scope.setContext("premium_live_search_empty", {
        desiredRoles: profile.desiredRoles,
        targetCountries: profile.targetCountries,
        targetCitiesCount: profile.targetCities.length,
        languagesSpoken: profile.languagesSpoken,
        queryCount: queries.length,
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
