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

function readPrompt(fileName: string) {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", fileName), "utf8");
  } catch {
    return "Find up to 3 high-quality, recent internship leads and return structured JSON only.";
  }
}

export function buildSearchQueries(profile: CandidateProfile) {
  const roles = profile.desiredRoles.length ? profile.desiredRoles : ["internship"];
  const countries = profile.targetCountries.length ? profile.targetCountries : ["international"];
  const industries = profile.targetIndustries.length ? profile.targetIndustries : ["business"];
  const cities = profile.targetCities;

  const directQueries = roles.flatMap((role) =>
    countries.flatMap((country) => [
      `${role} ${industries[0]} ${country}`,
      `${role} ${country} internship direct application`,
      `${industries[0]} ${role} ${country} careers`
    ])
  );

  const cityQueries = cities.flatMap((city) => roles.map((role) => `${role} ${city} ${industries[0]}`));
  const hiddenBoardQueries = [
    `site:greenhouse.io internship ${industries.join(" ")}`,
    `site:lever.co internship ${roles.join(" ")}`,
    `site:workable.com event intern ${countries.join(" ")}`,
    `site:teamtailor.com marketing intern ${industries.join(" ")}`,
    `site:smartrecruiters.com internship business development ${countries.join(" ")}`
  ];
  const nicheQueries = [
    `sports sponsorship intern Europe`,
    `commercial operations intern sports federation`,
    `partnerships intern sports ${countries.join(" ")}`,
    `event operations intern ${cities[0] ?? countries[0]}`,
    `stage marketing sport Suisse`
  ];

  return Array.from(new Set([...directQueries, ...cityQueries, ...hiddenBoardQueries, ...nicheQueries])).slice(0, 18);
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

  const response = await createOpenAIResponse<OpenAITextResponse>({
    model: process.env.OPENAI_MODEL || "gpt-5",
    reasoning: { effort: "low" },
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

  assertWebSearchWasUsed(response);
  const text = extractText(response);
  const offers = normalizeOffers(parseOffers(text));

  if (!offers.length) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-live-search");
      scope.setContext("premium_live_search_empty", {
        desiredRoles: profile.desiredRoles,
        targetCountries: profile.targetCountries,
        targetCitiesCount: profile.targetCities.length,
        languagesSpoken: profile.languagesSpoken,
        queryCount: queries.length
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
