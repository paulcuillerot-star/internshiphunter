import Link from "next/link";
import { PricingCTA } from "@/components/PricingCTA";

const heroChips = [
  "No endless scrolling",
  "Reviewed Europe match",
  "Built for business school students",
  "3 curated leads after unlock"
];

const steps = [
  ["1", "Pick your track", "Choose the area you’re targeting: marketing, finance, sports, strategy, sales, startup, product/data, luxury and more."],
  ["2", "Get one free match", "We show you one reviewed Europe opportunity from the cache for your selected track."],
  ["3", "Unlock your 3 premium leads", "Add your locations, languages, timing and profile. We run a live search and return up to 3 curated leads."]
];

const differences = [
  ["No endless scrolling", "You don’t browse hundreds of irrelevant roles."],
  ["No random backup applications", "The goal is to find internships you’d actually want to open."],
  ["No fake perfect matches", "If we broaden a result, we tell you why."]
];

const tracks = [
  "Sales, Business Development & Partnerships",
  "Marketing, Brand & Growth",
  "Strategy, Consulting & Project Management",
  "Finance, Investment & M&A",
  "Startup, Founder & Operations",
  "Product, Tech Business & Data",
  "Luxury, Retail, Consumer & E-commerce",
  "Sports, Events, Entertainment & Hospitality"
];

export default function HomePage() {
  return (
    <>
      <section className="bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f0fdf4_52%,#f6f8f9_100%)]">
        <div className="section grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-signal ring-1 ring-emerald-200">
              Internship Hunter
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-ink sm:text-6xl">
              Stop scrolling job boards. Get internships you actually want.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
              Internship Hunter helps business school students find curated internship leads without spending hours on LinkedIn or applying to random backup plans.
            </p>
            <p className="mt-5 max-w-xl rounded-lg border border-emerald-200 bg-white/75 px-4 py-3 text-base font-black text-signal shadow-[0_18px_40px_rgba(16,185,129,0.14)]">
              Spend 5 minutes here, not 5 hours on LinkedIn.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {heroChips.map((chip) => (
                <span key={chip} className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-900 shadow-[0_12px_28px_rgba(16,185,129,0.12)]">
                  {chip}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/apply" className="inline-flex items-center justify-center rounded-md bg-signal px-6 py-3 text-sm font-bold text-white shadow-[0_18px_38px_rgba(15,118,110,0.3)] transition hover:bg-emerald-700">
                Find my free match
              </Link>
              <span className="text-sm font-semibold text-ink/55">1 free Europe match. No account needed.</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-white/80 p-6 shadow-[0_26px_80px_rgba(16,24,32,0.13)]">
            <p className="text-sm font-bold uppercase tracking-wide text-signal">Shortlist preview</p>
            <h2 className="mt-3 text-3xl font-black text-ink">A list worth opening.</h2>
            <div className="mt-6 grid gap-3">
              {["Reviewed Europe match", "Curated lead with direct role context", "Close alternatives clearly labelled"].map((item) => (
                <div key={item} className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-bold text-ink shadow-soft">
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-ink/65">
              Not hundreds of links. Just enough signal to decide what is worth your time.
            </p>
          </div>
        </div>
      </section>

      <section className="section grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase text-signal">The problem</p>
          <h2 className="mt-3 text-3xl font-black text-ink sm:text-4xl">Tired of applying to random backup plans?</h2>
        </div>
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-lg leading-8 text-ink/75">
            Most internship searches turn into hours of scrolling, saving links, comparing tabs and applying to roles you don’t even care about.
          </p>
          <p className="mt-4 text-xl font-black text-signal">Internship Hunter gives you a shortlist worth your time.</p>
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

      <section className="section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-signal">Why it feels different</p>
            <h2 className="mt-3 text-3xl font-black text-ink">Not another job board.</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink/60">Internship Hunter is built to reduce noise, not create another place to scroll.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {differences.map(([title, copy]) => (
            <div key={title} className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft">
              <h3 className="text-xl font-black text-ink">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-ink/70">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="text-sm font-semibold uppercase text-signal">Tracks</p>
        <h2 className="mt-3 text-3xl font-black text-ink">Choose the lane you actually want.</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tracks.map((track) => (
            <div key={track} className="rounded-lg border border-line bg-white p-4 text-sm font-bold leading-6 text-ink shadow-soft">
              {track}
            </div>
          ))}
        </div>
      </section>

      <section className="section grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold uppercase text-signal">Start free</p>
          <h2 className="mt-2 text-3xl font-bold text-ink">Start free. Upgrade only if the first match makes sense.</h2>
          <div className="mt-5 grid gap-3 text-sm font-semibold text-ink/70">
            <p className="rounded-md bg-mist px-4 py-3">Free: 1 reviewed Europe opportunity</p>
            <p className="rounded-md bg-mist px-4 py-3">No account needed</p>
            <p className="rounded-md bg-mist px-4 py-3">No LinkedIn doom scroll</p>
          </div>
          <Link href="/apply" className="mt-6 button-secondary">Get my free match</Link>
        </div>
        <PricingCTA />
      </section>

      <section className="section pt-4">
        <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-mist p-8 text-center ring-1 ring-emerald-100">
          <h2 className="text-3xl font-bold text-ink">Skip the backup-plan spiral.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/70">Start with one reviewed Europe match. Upgrade only when you want a tighter shortlist.</p>
          <Link href="/apply" className="mt-6 inline-flex items-center justify-center rounded-md bg-signal px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700">Find my free match</Link>
        </div>
      </section>
    </>
  );
}
