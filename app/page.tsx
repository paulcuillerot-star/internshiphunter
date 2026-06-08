import Link from "next/link";
import { OfferCard } from "@/components/OfferCard";
import { PricingCTA } from "@/components/PricingCTA";
import { mockOffers } from "@/lib/mockData";

const heroChips = [
  "No more 47 open tabs",
  "Weekly curated examples",
  "Built for business school students",
  "Live search after unlock"
];

const steps = [
  ["1", "Share your search", "Upload your CV and tell us the countries and roles you want. Only the essentials are required."],
  ["2", "Get your internship track", "We match you to a clear business-school internship track and show 2 weekly cached examples."],
  ["3", "Unlock live personalized search", "When you want a deeper search, premium unlocks 3 curated internship leads with exact, close or broadened matches clearly labelled."]
];

const faqs = [
  ["Does the free flow run live AI search?", "No. The free demo uses rule-based matching and cached weekly examples to keep the experience fast and cost-controlled."],
  ["Do you scrape LinkedIn?", "No. LinkedIn scraping is intentionally not supported."],
  ["Can it work without API keys?", "Yes. The MVP uses realistic mock data until OpenAI, Supabase and Stripe are configured."],
  ["What happens after unlock?", "Premium uses your saved criteria to search for up to 3 curated leads. If your criteria are narrow, close alternatives may be included and clearly labelled."]
];

export default function HomePage() {
  return (
    <>
      <section className="bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f0fdf4_52%,#f6f8f9_100%)]">
        <div className="section grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-signal ring-1 ring-emerald-200">
              Internship Hunter
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-ink sm:text-6xl">
              Find internships that actually fit your profile.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
              Share what you are looking for. We match you to an internship search track, show 2 weekly examples for free, and unlock 3 curated internship leads when you want a deeper personalized search.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {heroChips.map((chip) => (
                <span key={chip} className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-900 shadow-[0_12px_28px_rgba(16,185,129,0.12)]">
                  {chip}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="inline-flex items-center justify-center rounded-md bg-signal px-6 py-3 text-sm font-bold text-white shadow-[0_18px_38px_rgba(15,118,110,0.3)] transition hover:bg-emerald-700">
                Find my track
              </Link>
              <a href="#how" className="button-secondary">See how it works</a>
            </div>
          </div>
          <div className="rounded-xl bg-white/70 p-2 shadow-[0_26px_80px_rgba(16,24,32,0.13)] ring-1 ring-emerald-100">
            <OfferCard offer={mockOffers[0]} reportId="report_demo" />
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <h2 className="text-3xl font-bold text-ink">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map(([step, title, body]) => (
            <div key={step} className="rounded-lg border border-line bg-white p-5 shadow-soft">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-signal text-sm font-bold text-white">{step}</span>
              <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/70">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Free</p>
          <h2 className="mt-2 text-3xl font-bold text-ink">Your matched track plus 2 examples</h2>
          <p className="mt-3 text-sm leading-6 text-ink/70">A quick way to see which direction fits before paying for live personalized research.</p>
          <Link href="/apply" className="mt-6 button-secondary">Get my free track</Link>
        </div>
        <PricingCTA />
      </section>

      <section className="section">
        <h2 className="text-3xl font-bold text-ink">FAQ</h2>
        <div className="mt-6 divide-y divide-line rounded-lg border border-line bg-white">
          {faqs.map(([question, answer]) => (
            <div key={question} className="p-5">
              <h3 className="font-semibold text-ink">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/70">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section pt-4">
        <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-mist p-8 text-center ring-1 ring-emerald-100">
          <h2 className="text-3xl font-bold text-ink">Find internships worth applying to.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/70">Start with the free track. Upgrade later when you want 3 curated leads from a personalized live search.</p>
          <Link href="/apply" className="mt-6 inline-flex items-center justify-center rounded-md bg-signal px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700">Start free</Link>
        </div>
      </section>
    </>
  );
}
