import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createOpenAIResponse, hasOpenAIConfig } from "@/lib/openai";
import { mockOffers } from "@/lib/mockData";
import type { CandidateProfile, ScoredInternshipOffer } from "@/lib/types";

type OpenAITextResponse = { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

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
            title: { type: "string" }, company: { type: "string" }, location: { type: "string" }, country: { type: "string" }, city: { type: "string" }, url: { type: "string" }, source: { type: "string" }, deadline: { type: "string" }, publishedDate: { type: "string" }, descriptionSummary: { type: "string" }, requirementsSummary: { type: "string" }, compensation: { type: "string" }, languageRequirements: { type: "array", items: { type: "string" } }, rawSourceSnippet: { type: "string" }, matchScore: { type: "number" }, qualityScore: { type: "number" }, probabilityOfInterview: { type: "number" }, whyItMatches: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, applicationAngle: { type: "string" }, linkedinMessage: { type: "string" }, coverLetterHook: { type: "string" }, isPremium: { type: "boolean" }
          },
          required: ["title", "company", "location", "country", "city", "url", "source", "deadline", "publishedDate", "descriptionSummary", "requirementsSummary", "compensation", "languageRequirements", "rawSourceSnippet", "matchScore", "qualityScore", "probabilityOfInterview", "whyItMatches", "risks", "applicationAngle", "linkedinMessage", "coverLetterHook", "isPremium"]
        }
      }
    },
    required: ["offers"]
  }
};

function readPrompt(fileName: string) { return fs.readFileSync(path.join(process.cwd(), "prompts", fileName), "utf8"); }

export function buildSearchQueries(profile: CandidateProfile) {
  const roles = profile.desiredRoles.length ? profile.desiredRoles : ["internship"];
  const countries = profile.targetCountries.length ? profile.targetCountries : ["international"];
  const industries = profile.targetIndustries.length ? profile.targetIndustries : ["business"];
  const cities = profile.targetCities;
  const direct = roles.flatMap((role) => countries.flatMap((country) => [`${role} ${industries[0]} ${country}`, `${role} ${country} internship direct application`, `${industries[0]} ${role} ${country} careers`]));
  const city = cities.flatMap((cityName) => roles.map((role) => `${role} ${cityName} ${industries[0]}`));
  const hidden = [`site:greenhouse.io internship ${industries.join(" ")}`, `site:lever.co internship ${roles.join(" ")}`, `site:workable.com event intern ${countries.join(" ")}`, `site:teamtailor.com marketing intern ${industries.join(" ")}`, `site:smartrecruiters.com internship business development ${countries.join(" ")}`];
  const niche = ["sports sponsorship intern Europe", "commercial operations intern sports federation", `partnerships intern sports ${countries.join(" ")}`, `event operations intern ${cities[0] ?? countries[0]}`, "stage marketing sport Suisse"];
  return Array.from(new Set([...direct, ...city, ...hidden, ...niche])).slice(0, 18);
}

function extractText(response: OpenAITextResponse) {
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean).join("\n") ?? "";
}

function normalizeOffers(offers: Array<Omit<ScoredInternshipOffer, "id">>): ScoredInternshipOffer[] {
  return offers.map((offer, index) => ({ id: `offer_${Date.now()}_${index + 1}`, ...offer, isPremium: index >= 2 }));
}

export async function webInternshipSearch(profile: CandidateProfile, cvText: string) {
  const queries = buildSearchQueries(profile);
  if (!hasOpenAIConfig()) return { offers: mockOffers, querySummary: queries.join("; "), rawResponse: "Mock response because OPENAI_API_KEY is not configured." };

  const response = await createOpenAIResponse<OpenAITextResponse>({
    model: process.env.OPENAI_MODEL || "gpt-5",
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    text: { format: outputSchema },
    input: [
      { role: "system", content: `${readPrompt("internship-web-search.md")}\n\n${readPrompt("job-scoring.md")}` },
      { role: "user", content: JSON.stringify({ today: new Date().toISOString().slice(0, 10), candidateProfile: profile, cvText, suggestedQueries: queries, requiredOutput: "Return exactly 7 offers. First 2 free, remaining 5 premium." }, null, 2) }
    ]
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as { offers: Array<Omit<ScoredInternshipOffer, "id">> };
  return { offers: normalizeOffers(parsed.offers), querySummary: queries.join("; "), rawResponse: text };
}
