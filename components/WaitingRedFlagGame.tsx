"use client";

import { useMemo, useState } from "react";

type Answer = "Legit" | "Red flag" | "Alternance trap" | "Not an internship" | "Too senior";

type RadarCard = {
  title: string;
  description: string;
  answer: Answer;
  feedback: string;
};

const answers: Answer[] = ["Legit", "Red flag", "Alternance trap", "Not an internship", "Too senior"];

const cards: RadarCard[] = [
  {
    title: "CEO Right Hand Intern - Remote",
    description: "Own growth, sales, fundraising, operations, hiring and product. Compensation: experience.",
    answer: "Red flag",
    feedback: "Too many responsibilities, unclear compensation and a vague contract signal a weak opportunity."
  },
  {
    title: "Business Development Intern - Paris",
    description: "6-month paid internship supporting CRM, prospecting and partner follow-up. Start: September 2026.",
    answer: "Legit",
    feedback: "Clear role, clear duration and realistic responsibilities make this look credible."
  },
  {
    title: "Sales Assistant - Alternance Only",
    description: "12-month apprenticeship contract required. Rhythm: 3 weeks company, 1 week school.",
    answer: "Alternance trap",
    feedback: "This is an apprenticeship, not a standard internship, so it should be filtered if alternance is excluded."
  },
  {
    title: "Junior Account Executive",
    description: "Full-time CDI role. 2 years of closing experience required. Own a revenue quota from day one.",
    answer: "Too senior",
    feedback: "A full-time junior job with prior closing experience is not an internship."
  },
  {
    title: "Marketing Intern - Mobility Startup",
    description: "Paid 6-month internship helping with CRM cleanup, partner research and campaign reporting.",
    answer: "Legit",
    feedback: "The scope is realistic, the contract is clear and the tasks match an internship level."
  },
  {
    title: "Founder Associate Intern",
    description: "Unpaid role. Replace our sales, marketing and ops teams while learning from leadership.",
    answer: "Red flag",
    feedback: "Unpaid work with oversized responsibilities is a strong warning sign."
  },
  {
    title: "Campus Ambassador",
    description: "Commission-only promotion of a student app. No internship agreement mentioned.",
    answer: "Not an internship",
    feedback: "No internship agreement or learning scope is described, so it should not pass as an internship."
  },
  {
    title: "Commercial Intern - Lyon",
    description: "Support lead qualification, update CRM notes and prepare prospect lists for the sales team.",
    answer: "Legit",
    feedback: "The work is specific, junior-friendly and aligned with commercial internship expectations."
  },
  {
    title: "Growth Hacker Ninja Intern",
    description: "Must master Python, SQL, paid ads, design, scraping and closing enterprise deals.",
    answer: "Red flag",
    feedback: "The title and requirements are noisy, overbroad and likely misaligned with a focused internship."
  },
  {
    title: "Automotive BD Intern - Munich",
    description: "6-month internship supporting dealer mapping, partner outreach and market notes. English required.",
    answer: "Legit",
    feedback: "The role, industry, duration and language expectation are concrete enough to evaluate."
  }
];

export function WaitingRedFlagGame() {
  const orderedCards = useMemo(() => cards, []);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Answer | null>(null);
  const [correct, setCorrect] = useState(0);
  const card = orderedCards[index % orderedCards.length];
  const answered = selected !== null;
  const isCorrect = selected === card.answer;

  function choose(answer: Answer) {
    if (answered) return;
    setSelected(answer);
    if (answer === card.answer) setCorrect((value) => value + 1);
  }

  function nextCard() {
    setIndex((value) => value + 1);
    setSelected(null);
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-mist p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-ink/45">Red Flag Radar</p>
          <h2 className="mt-1 text-xl font-black text-ink">Spot the internship signal</h2>
        </div>
        <p className="text-sm font-bold text-signal">Score {correct}/{index + (answered ? 1 : 0)}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/65">While we search, test your internship red flag radar.</p>

      <div className="mt-4 rounded-md bg-white p-4 ring-1 ring-line">
        <p className="text-base font-black text-ink">{card.title}</p>
        <p className="mt-2 text-sm leading-6 text-ink/65">{card.description}</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {answers.map((answer) => {
          const active = selected === answer;
          const revealCorrect = answered && answer === card.answer;
          return (
            <button
              key={answer}
              type="button"
              onClick={() => choose(answer)}
              disabled={answered}
              className={`rounded-md border px-3 py-2 text-left text-sm font-bold transition ${
                revealCorrect
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : active
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-line bg-white text-ink/70 hover:border-emerald-200 hover:text-ink"
              } disabled:cursor-default`}
            >
              {answer}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="mt-4 rounded-md bg-white p-4 ring-1 ring-line">
          <p className={`text-sm font-black ${isCorrect ? "text-emerald-700" : "text-amber-700"}`}>{isCorrect ? "Correct" : `Answer: ${card.answer}`}</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">{card.feedback}</p>
          <button type="button" onClick={nextCard} className="mt-4 inline-flex button-secondary text-sm">
            Next card
          </button>
        </div>
      ) : null}
    </div>
  );
}
