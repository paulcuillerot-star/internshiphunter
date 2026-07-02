"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type RoastResult = {
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

function ScoreCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-2 text-3xl font-black text-ink">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h3 className="text-lg font-black text-ink">{title}</h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/70">
        {items.map((item) => (
          <li key={item} className="rounded-md bg-mist px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InternshipRoastForm() {
  const [offerText, setOfferText] = useState("");
  const [studentContext, setStudentContext] = useState("");
  const [result, setResult] = useState<RoastResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setCopied(false);

    if (!offerText.trim()) {
      setError("Paste an internship offer first.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/roast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerText, studentContext })
    });
    const data = (await response.json().catch(() => null)) as { result?: RoastResult; error?: string } | null;

    setLoading(false);

    if (!response.ok || !data?.result) {
      setError(data?.error ?? "The roast could not run. The internship remains suspicious.");
      return;
    }

    setResult(data.result);
  }

  async function copyOneLiner() {
    if (!result?.shareableOneLiner) return;
    await navigator.clipboard.writeText(result.shareableOneLiner);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <form onSubmit={submit} className="grid gap-5 rounded-lg border border-line bg-white p-5 shadow-soft">
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <label className="grid gap-2">
          <span className="label">Paste any internship offer</span>
          <textarea
            className="field min-h-72"
            value={offerText}
            onChange={(event) => setOfferText(event.target.value)}
            placeholder="Paste the job title, company description, responsibilities, requirements, compensation notes, and anything that smells like 'fast-paced learning opportunity'."
            required
          />
        </label>
        <label className="grid gap-2">
          <span className="label">Tell us about yourself in 2-3 lines.</span>
          <textarea
            className="field min-h-24"
            value={studentContext}
            onChange={(event) => setStudentContext(event.target.value)}
            placeholder="Example: MSc student, looking for a 6-month marketing or business development internship in Europe, fluent in French and English."
          />
        </label>
        <button type="submit" disabled={loading} className="button-primary w-full sm:w-fit">
          {loading ? "Roasting..." : "Roast this internship"}
        </button>
      </form>

      <section className="rounded-lg border border-emerald-100 bg-mist p-5 shadow-soft">
        {!result ? (
          <div className="flex h-full min-h-96 flex-col justify-center rounded-lg border border-dashed border-emerald-200 bg-white/70 p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-signal">Roast report</p>
            <h2 className="mt-3 text-3xl font-black text-ink">Your internship reality check appears here.</h2>
            <p className="mt-4 text-sm leading-6 text-ink/65">
              We will keep it useful: no legal certainty, no student roasting, just a read on whether the offer looks worth your time based on the text.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="rounded-lg bg-ink p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-white/55">Verdict</p>
              <h2 className="mt-2 text-2xl font-black">{result.verdict}</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ScoreCard label="Bullshit Risk" value={result.bullshitRiskPercent} suffix="%" />
              <ScoreCard label="LinkedIn Flex Score" value={result.linkedInFlexScore} suffix="/10" />
              <ScoreCard label="Actual Learning Score" value={result.actualLearningScore} suffix="/10" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ListBlock title="Green Flags" items={result.greenFlags} />
              <ListBlock title="Red Flags" items={result.redFlags} />
            </div>

            <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
              <h3 className="text-lg font-black text-ink">What they say / What they mean</h3>
              <div className="mt-4 grid gap-3">
                {result.whatTheySayWhatTheyMean.map((item) => (
                  <div key={`${item.whatTheySay}-${item.whatTheyMean}`} className="grid gap-2 rounded-md bg-mist p-4 text-sm md:grid-cols-2">
                    <p>
                      <span className="font-black text-ink">They say:</span> <span className="text-ink/70">{item.whatTheySay}</span>
                    </p>
                    <p>
                      <span className="font-black text-ink">They might mean:</span> <span className="text-ink/70">{item.whatTheyMean}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
                <h3 className="text-lg font-black text-ink">Should you apply?</h3>
                <p className="mt-2 text-sm leading-6 text-ink/70">{result.shouldYouApply}</p>
              </div>
              <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
                <h3 className="text-lg font-black text-ink">Hunter&apos;s honest take</h3>
                <p className="mt-2 text-sm leading-6 text-ink/70">{result.honestTake}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-5 ring-1 ring-emerald-100">
                <p className="text-xs font-bold uppercase tracking-wide text-signal">Shareable one-liner</p>
                <p className="mt-2 text-lg font-black text-ink">{result.shareableOneLiner}</p>
                <button type="button" onClick={copyOneLiner} className="mt-4 inline-flex button-secondary">
                  {copied ? "Copied" : "Copy one-liner"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-white p-5 shadow-soft">
              <p className="text-lg font-black text-ink">Want us to find internships actually worth your time? Try Premium Search.</p>
              <Link href="/premium/start" className="mt-4 inline-flex button-primary">
                Try Premium Search
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
