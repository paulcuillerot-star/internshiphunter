"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { internshipTrackLabels } from "@/lib/searchBuckets";

const premiumOptions = [
  "Upload your CV",
  "International outside Europe search",
  "Exact countries and cities",
  "Languages",
  "Start date",
  "Internship duration",
  "Companies already applied to",
  "Things to avoid",
  "CV-based matching",
  "Application angle",
  "LinkedIn message",
  "Cover letter hook"
];

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="label flex items-center justify-between gap-3">
      <span>{children}</span>
      <span className="text-signal">Required</span>
    </span>
  );
}

function TrackButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${selected ? "border-signal bg-emerald-50 text-signal" : "border-line bg-white text-ink/70 hover:border-signal"}`}
    >
      {label}
    </button>
  );
}

function MarketOption({ label, status, locked }: { label: string; status: string; locked?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-3 ${locked ? "border-line bg-mist text-ink/45" : "border-signal bg-emerald-50 text-ink"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${locked ? "bg-white text-ink/45" : "bg-white text-signal"}`}>{status}</span>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    data.set("desiredRoles", selectedTrack);
    data.set("targetCountries", "Europe");

    if (!data.get("email") || !selectedTrack) {
      setLoading(false);
      setError("Email and one internship track are required.");
      return;
    }

    const response = await fetch("/api/search-internships", { method: "POST", body: data });
    if (!response.ok) { setLoading(false); setError("The free match could not be created. Please try again."); return; }
    const result = (await response.json()) as { reportId: string };
    router.push(`/report/${result.reportId}`);
  }

  return (
    <section className="section">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-signal">Free internship match</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Get your free match in under 20 seconds.</h1>
        <p className="mt-3 text-ink/70">
          Your free match uses your internship track and broad target market. Premium search uses your CV, exact cities, languages, start date, duration and exclusions.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 grid max-w-4xl gap-5 rounded-lg border border-line bg-white p-5 shadow-soft">
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <label className="grid gap-2">
          <RequiredLabel>Email</RequiredLabel>
          <input className="field" name="email" type="email" required placeholder="alex@example.com" />
        </label>

        <section className="grid gap-3">
          <RequiredLabel>Preferred internship track</RequiredLabel>
          <input type="hidden" name="desiredRoles" value={selectedTrack} />
          <div className="grid gap-2 sm:grid-cols-2">
            {internshipTrackLabels.map((track) => (
              <TrackButton key={track} label={track} selected={selectedTrack === track} onClick={() => setSelectedTrack(track)} />
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <RequiredLabel>Target market</RequiredLabel>
          <input type="hidden" name="targetCountries" value="Europe" />
          <div className="grid gap-2 sm:grid-cols-2">
            <MarketOption label="Europe" status="Available" />
            <MarketOption label="International outside Europe" status="Requires Premium" locked />
          </div>
        </section>

        <button type="submit" disabled={loading} className="button-primary w-full sm:w-fit">
          {loading ? "Generating..." : "Generate my free match"}
        </button>
      </form>

      <section className="mt-8 max-w-4xl rounded-lg border border-line bg-mist p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-signal">Premium personalization</p>
            <h2 className="mt-2 text-2xl font-bold text-ink">Unlock a deeper search later.</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink/50">Locked</span>
        </div>
        <p className="mt-3 text-sm text-ink/60">
          These inputs are reserved for premium live search and are not needed for your free match.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {premiumOptions.map((option) => (
            <div key={option} className="rounded-md border border-line bg-white px-3 py-3 text-sm text-ink/50">
              <p className="font-semibold text-ink/60">{option}</p>
              <p className="mt-1 text-xs font-bold uppercase text-ink/35">Requires Premium</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
