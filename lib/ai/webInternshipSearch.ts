import "server-only";
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
  name: "internship_search_results",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      offers: {
        type: "array",
        minItems: 7,
        maxItems: 7,
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
    return "Find a small set of high-quality, recent internship offers and return structured JSON only.";
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
  const normalized = offers.slice(0, 7).map((offer, index) => ({
    id: `offer_${Date.now()}_${index + 1}`,
    ...offer,
    isPremium: index >= 2
  }));

  if (normalized.length < 7) {
    const existingIds = new Set(normalized.map((offer) => offer.id));
    const fillers = mockOffers
      .filter((offer) => !existingIds.has(offer.id))
      .slice(0, 7 - normalized.length)
      .map((offer, index) => ({ ...offer, id: `mock_fallback_${Date.now()}_${index + 1}` }));

    return [...normalized, ...fillers].map((offer, index) => ({ ...offer, isPremium: index >= 2 }));
  }

  return normalized;
}

export async function webInternshipSearch(profile: CandidateProfile, cvText: string) {
  if (!hasOpenAIConfig()) {
    return {
      offers: mockOffers,
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
            requiredOutput: "Return exactly 7 offers. First 2 must be free, remaining 5 premium."
          },
          null,
          2
        )
      }
    ]
  });

  assertWebSearchWasUsed(response);
  const text = extractText(response);
  const offers = parseOffers(text);

  return {
    offers: normalizeOffers(offers),
    querySummary: queries.join("; "),
    rawResponse: text
  };
}
