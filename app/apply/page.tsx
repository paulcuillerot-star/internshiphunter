"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label flex items-center justify-between gap-3">
      <span>{children}</span>
      <span className={required ? "text-signal" : "text-ink/40"}>{required ? "Required" : "Optional"}</span>
    </span>
  );
}

export default function ApplyPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    if (!data.get("email") || !data.get("cv") || !data.get("targetCountries") || !data.get("desiredRoles")) {
      setLoading(false);
      setError("Email, CV, target country and desired role are required.");
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
          Only the essentials are required. Add details if you want a better match.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 grid max-w-4xl gap-5 rounded-lg border border-line bg-white p-5 shadow-soft">
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

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <FieldLabel required>Target countries</FieldLabel>
            <input className="field" name="targetCountries" required placeholder="Switzerland, Singapore" />
          </label>
          <label className="grid gap-2">
            <FieldLabel required>Desired roles</FieldLabel>
            <input className="field" name="desiredRoles" required placeholder="Marketing intern, Partnerships intern" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Target cities</FieldLabel>
            <input className="field" name="targetCities" placeholder="Geneva, Lausanne" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Target industries</FieldLabel>
            <input className="field" name="targetIndustries" placeholder="Sport, Events, Marketing" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Internship start date</FieldLabel>
            <input className="field" name="internshipStartDate" type="month" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Internship duration</FieldLabel>
            <input className="field" name="internshipDuration" placeholder="6 months" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Languages spoken</FieldLabel>
            <input className="field" name="languagesSpoken" placeholder="English, French" />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Minimum compensation</FieldLabel>
            <input className="field" name="minimumCompensation" placeholder="Paid preferred" />
          </label>
        </div>

        <label className="grid gap-2">
          <FieldLabel>Companies already applied to</FieldLabel>
          <input className="field" name="companiesAlreadyAppliedTo" placeholder="Decathlon, UEFA, LVMH" />
        </label>
        <label className="grid gap-2">
          <FieldLabel>Ideal internship description</FieldLabel>
          <textarea className="field min-h-28" name="idealInternshipDescription" placeholder="A hands-on role around sports events, partnerships or brand activation." />
        </label>
        <label className="grid gap-2">
          <FieldLabel>Things to avoid</FieldLabel>
          <textarea className="field min-h-24" name="thingsToAvoid" placeholder="Pure sales roles, unpaid remote-only internships, senior roles." />
        </label>

        <button type="submit" disabled={loading} className="button-primary w-full sm:w-fit">
          {loading ? "Generating..." : "Generate my free track"}
        </button>
      </form>
    </section>
  );
}
