"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { internshipTrackLabels, marketChoices } from "@/lib/searchBuckets";

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label flex items-center justify-between gap-3">
      <span>{children}</span>
      <span className={required ? "text-signal" : "text-ink/40"}>{required ? "Required" : "Optional"}</span>
    </span>
  );
}

function ToggleButton({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${selected ? "border-signal bg-emerald-50 text-signal" : "border-line bg-white text-ink/70 hover:border-signal"} ${disabled && !selected ? "cursor-not-allowed opacity-45" : ""}`}
    >
      {label}
    </button>
  );
}

export default function ApplyPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);

  function toggleTrack(track: string) {
    setSelectedTracks((current) => current.includes(track) ? current.filter((item) => item !== track) : current.length < 2 ? [...current, track] : current);
  }

  function toggleMarket(market: string) {
    setSelectedMarkets((current) => current.includes(market) ? current.filter((item) => item !== market) : [market]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    data.set("desiredRoles", selectedTracks.join(","));
    data.set("targetCountries", selectedMarkets.join(","));

    if (!data.get("email") || !data.get("cv") || !selectedMarkets.length || !selectedTracks.length) {
      setLoading(false);
      setError("Email, CV, one target market and at least one internship track are required.");
      return;
    }

    if (selectedTracks.length > 2) {
      setLoading(false);
      setError("Please select no more than 2 internship tracks.");
      return;
    }

    const response = await fetch("/api/search-internships", { method: "POST", body: data });
    if (!response.ok) { setLoading(false); setError("The search could not be created. Please try again."); return; }
    const result = (await response.json()) as { reportId: string };
    router.push(`/report/${result.reportId}`);
  }

  return (
    <section className="section">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-signal">Create your search</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Find your best internship direction in minutes.</h1>
        <p className="mt-3 text-ink/70">
          Only the essentials are required. The free result is based on your selected track, target market, languages and profile details. Your CV is stored for the later paid flow, but it is not parsed for the free match yet.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 grid max-w-4xl gap-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <FieldLabel required>Email</FieldLabel>
            <input className="field" name="email" type="email" required placeholder="alex@example.com" />
          </label>
          <label className="grid gap-2">
            <FieldLabel required>CV upload, PDF only</FieldLabel>
            <input className="field" name="cv" type="file" accept="application/pdf" required />
          </label>
        </div>

        <section className="grid gap-3">
          <FieldLabel required>What kind of internship are you looking for?</FieldLabel>
          <p className="text-sm text-ink/60">Choose up to 2 tracks.</p>
          <input type="hidden" name="desiredRoles" value={selectedTracks.join(",")} />
          <div className="grid gap-2 sm:grid-cols-2">
            {internshipTrackLabels.map((track) => (
              <ToggleButton key={track} label={track} selected={selectedTracks.includes(track)} disabled={selectedTracks.length >= 2} onClick={() => toggleTrack(track)} />
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <FieldLabel required>Target market</FieldLabel>
          <p className="text-sm text-ink/60">Choose the market you want us to match first.</p>
          <input type="hidden" name="targetCountries" value={selectedMarkets.join(",")} />
          <div className="grid gap-2 sm:grid-cols-2">
            {marketChoices.map((market) => (
              <ToggleButton key={market} label={market} selected={selectedMarkets.includes(market)} onClick={() => toggleMarket(market)} />
            ))}
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <FieldLabel>Target cities</FieldLabel>
            <input className="field" name="targetCities" placeholder="Geneva, Lausanne" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Languages spoken</FieldLabel>
            <input className="field" name="languagesSpoken" placeholder="English, French" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Internship start date</FieldLabel>
            <input className="field" name="internshipStartDate" type="month" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Internship duration</FieldLabel>
            <input className="field" name="internshipDuration" placeholder="6 months" />
          </label>
        </div>

        <label className="grid gap-2">
          <FieldLabel>Companies already applied to</FieldLabel>
          <input className="field" name="companiesAlreadyAppliedTo" placeholder="Decathlon, UEFA, LVMH" />
        </label>
        <label className="grid gap-2">
          <FieldLabel>Things to avoid</FieldLabel>
          <textarea className="field min-h-24" name="thingsToAvoid" placeholder="Unpaid internships, remote-only roles, senior roles." />
        </label>

        <button type="submit" disabled={loading} className="button-primary w-full sm:w-fit">
          {loading ? "Generating..." : "Generate my free match"}
        </button>
      </form>
    </section>
  );
}
