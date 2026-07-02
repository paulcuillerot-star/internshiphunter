import { NextResponse } from "next/server";
import { createOpenAIResponse, hasOpenAIConfig } from "@/lib/openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type RoastResult = {
  verdict: string;
  bullshitRiskPercent: number;
  linkedInFlexScore: number;
  actualLearningScore: number;
  greenFlags: string[];
  redFlags: string[];
  whatTheySayWhatTheyMean: Array<{
    whatTheySay: string;
    whatTheyMean: string;
  }>;
  shouldYouApply: string;
  honestTake: string;
  shareableOneLiner: string;
};

const minOfferLength = 120;
const maxOfferLength = 15_000;
const roastFailedMessage = "The roast could not run cleanly. Try again with a shorter offer.";

type OpenAITextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
};

const roastSchema = {
  type: "json_schema",
  name: "internship_roast",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verdict: { type: "string" },
      bullshitRiskPercent: { type: "number" },
      linkedInFlexScore: { type: "number" },
      actualLearningScore: { type: "number" },
      greenFlags: { type: "array", items: { type: "string" } },
      redFlags: { type: "array", items: { type: "string" } },
      whatTheySayWhatTheyMean: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            whatTheySay: { type: "string" },
            whatTheyMean: { type: "string" }
          },
          required: ["whatTheySay", "whatTheyMean"]
        }
      },
      shouldYouApply: { type: "string" },
      honestTake: { type: "string" },
      shareableOneLiner: { type: "string" }
    },
    required: [
      "verdict",
      "bullshitRiskPercent",
      "linkedInFlexScore",
      "actualLearningScore",
      "greenFlags",
      "redFlags",
      "whatTheySayWhatTheyMean",
      "shouldYouApply",
      "honestTake",
      "shareableOneLiner"
    ]
  }
};

const mockRoast: RoastResult = {
  verdict: "Looks promising, but the job post is wearing a tiny fake mustache.",
  bullshitRiskPercent: 64,
  linkedInFlexScore: 8,
  actualLearningScore: 6,
  greenFlags: ["The scope sounds internship-level.", "There is at least some hint of real mentoring."],
  redFlags: ["Several responsibilities are vague enough to hide chaos.", "Compensation and supervision are not very clear."],
  whatTheySayWhatTheyMean: [
    {
      whatTheySay: "Fast-paced environment",
      whatTheyMean: "You might learn quickly, or you might become the team calendar with a pulse."
    },
    {
      whatTheySay: "Hands-on ownership",
      whatTheyMean: "Useful if supported, risky if it means nobody has time to train you."
    }
  ],
  shouldYouApply: "Maybe, but ask about mentorship, weekly tasks and compensation before getting emotionally attached.",
  honestTake: "Based on the text, this looks like it might be useful if the team is structured. If they dodge basic questions, politely sprint away.",
  shareableOneLiner: "This internship might build your skills, or just your tolerance for vague Slack messages."
};

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeRoast(result: RoastResult): RoastResult {
  return {
    ...result,
    bullshitRiskPercent: clamp(result.bullshitRiskPercent, 0, 100),
    linkedInFlexScore: clamp(result.linkedInFlexScore, 0, 10),
    actualLearningScore: clamp(result.actualLearningScore, 0, 10),
    greenFlags: result.greenFlags.slice(0, 5),
    redFlags: result.redFlags.slice(0, 5),
    whatTheySayWhatTheyMean: result.whatTheySayWhatTheyMean.slice(0, 4)
  };
}

export async function POST(request: Request) {
  const { offerText, studentContext } = (await request.json()) as {
    offerText?: string;
    studentContext?: string;
  };

  if (!offerText?.trim()) {
    return NextResponse.json({ error: "Paste an internship offer first." }, { status: 400 });
  }

  const trimmedOfferText = offerText.trim();
  if (trimmedOfferText.length < minOfferLength) {
    return NextResponse.json({ error: "Paste a little more of the offer so we have enough to roast." }, { status: 400 });
  }

  if (trimmedOfferText.length > maxOfferLength) {
    return NextResponse.json({ error: "That offer is a bit too long to roast cleanly. Try pasting the most important parts." }, { status: 400 });
  }

  if (!hasOpenAIConfig()) {
    return NextResponse.json({ result: mockRoast });
  }

  try {
    const response = await createOpenAIResponse<OpenAITextResponse>({
      model: process.env.OPENAI_MODEL || "gpt-5",
      text: {
        format: roastSchema
      },
      input: [
        {
          role: "system",
          content:
            "You are Internship Roast by Internship Hunter. Roast the internship offer, not the student. Be funny, honest, slightly savage, and useful. Avoid legal certainty. Use cautious wording like looks like, might, risk, and based on the text. Do not use web search. Do not claim facts beyond the pasted text."
        },
        {
          role: "user",
          content: JSON.stringify({
            internshipOfferText: trimmedOfferText.slice(0, 12_000),
            studentContext: studentContext?.slice(0, 2_000) ?? "",
            requiredTone: "Funny, honest, slightly savage, but useful.",
            requiredOutput:
              "Return a structured roast with a verdict, risk scores, green flags, red flags, translation of corporate phrases, application advice, an honest take and a shareable one-liner."
          })
        }
      ]
    });

    const text = extractText(response);
    const parsed = JSON.parse(text) as RoastResult;

    return NextResponse.json({ result: normalizeRoast(parsed) });
  } catch {
    return NextResponse.json({ error: roastFailedMessage }, { status: 500 });
  }
}
