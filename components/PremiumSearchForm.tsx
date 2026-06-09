"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { PremiumSearchInputs } from "@/lib/types";

const fieldClass = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink/35 focus:border-signal focus:ring-4 focus:ring-signal/10";
const labelClass = "grid gap-2 text-sm font-bold text-ink";
const showTestPreset = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_PREMIUM_TEST_PRESET === "true";

const testPreset = {
  targetLocations: "Paris, France, Geneva, Switzerland, Brussels, Belgium",
  languagesSpoken: "French, English, Italian",
  internshipStartDate: "September 2026",
  internshipDuration: "4-6 months, flexible",
  companiesAlreadyAppliedTo: "Nike, L'Oréal, Chanel",
  profileSummary:
    "Business school master student at SKEMA with experience in business development, e-retail, category management, sports fan experience and event coordination. Strong skills in commercial analysis, sales support, partnerships, project coordination and client relationship management.",
  idealInternshipDescription:
    "A 4-6 month internship starting around September 2026 in business development, sales, partnerships, sponsorship, marketing or event management. Ideally in tech, sport, events, consumer brands, SaaS, hospitality or a fast-growing company. The role should include prospecting, account management, partnership activation, market research, client meetings, commercial reporting or campaign coordination.",
  thingsToAvoid:
    "Avoid pure finance, accounting, coding-heavy, German-only, purely administrative, senior-level, full-time permanent roles, companies already applied to and internships longer than 6 months."
};

function joinList(items?: string[]) {
  return items?.join(", ") ?? "";
}

function combinedLocations(initialInputs?: PremiumSearchInputs) {
  return Array.from(new Set([...(initialInputs?.targetCountries ?? []), ...(initialInputs?.targetCities ?? [])])).join(", ");
}

export function PremiumSearchForm({ reportId, accessToken, initialInputs, paymentCancelled = false }: { reportId: string; accessToken?: string; initialInputs?: PremiumSearchInputs; paymentCancelled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [targetLocations, setTargetLocations] = useState(combinedLocations(initialInputs));
  const [languagesSpoken, setLanguagesSpoken] = useState(joinList(initialInputs?.languagesSpoken));
  const [internshipStartDate, setInternshipStartDate] = useState(initialInputs?.internshipStartDate ?? "");
  const [internshipDuration, setInternshipDuration] = useState(initialInputs?.internshipDuration ?? "");
  const [companiesAlreadyAppliedTo, setCompaniesAlreadyAppliedTo] = useState(joinList(initialInputs?.companiesAlreadyAppliedTo));
  const [profileSummary, setProfileSummary] = useState(initialInputs?.profileSummary ?? "");
  const [idealInternshipDescription, setIdealInternshipDescription] = useState(initialInputs?.idealInternshipDescription ?? "");
  const [thingsToAvoid, setThingsToAvoid] = useState(initialInputs?.thingsToAvoid ?? "");

  function applyTestPreset() {
    setTargetLocations(testPreset.targetLocations);
    setLanguagesSpoken(testPreset.languagesSpoken);
    setInternshipStartDate(testPreset.internshipStartDate);
    setInternshipDuration(testPreset.internshipDuration);
    setCompaniesAlreadyAppliedTo(testPreset.companiesAlreadyAppliedTo);
    setProfileSummary(testPreset.profileSummary);
    setIdealInternshipDescription(testPreset.idealInternshipDescription);
    setThingsToAvoid(testPreset.thingsToAvoid);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const targetLocationsValue = String(formData.get("targetLocations") ?? "");
    const payload = {
      reportId,
      token: accessToken,
      premiumInputs: {
        targetCountries: targetLocationsValue,
        targetCities: targetLocationsValue,
        languagesSpoken: String(formData.get("languagesSpoken") ?? ""),
        internshipStartDate: String(formData.get("internshipStartDate") ?? ""),
        internshipDuration: String(formData.get("internshipDuration") ?? ""),
        companiesAlreadyAppliedTo: String(formData.get("companiesAlreadyAppliedTo") ?? ""),
        thingsToAvoid: String(formData.get("thingsToAvoid") ?? ""),
        profileSummary: String(formData.get("profileSummary") ?? ""),
        idealInternshipDescription: String(formData.get("idealInternshipDescription") ?? "")
      }
    };

    const response = await fetch("/api/create-premium-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!response.ok || !result?.url) {
      setError(result?.error ?? "We could not open checkout. Please try again.");
      setLoading(false);
      return;
    }

    window.location.href = result.url;
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-6 rounded-2xl border border-emerald-100 bg-mist p-5 shadow-soft sm:p-6">
      {paymentCancelled ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Payment was cancelled. Your premium criteria are saved; you can continue when ready.</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div>
        <p className="text-sm font-semibold uppercase text-signal">Your search criteria</p>
        <h2 className="mt-2 text-2xl font-black text-ink">Tell us what would be worth opening</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Your email is already linked to your free report.</p>
        {showTestPreset ? (
          <button type="button" onClick={applyTestPreset} className="mt-4 inline-flex button-secondary">
            Use test preset
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Target countries / cities
          <input name="targetLocations" className={fieldClass} value={targetLocations} onChange={(event) => setTargetLocations(event.target.value)} placeholder="Switzerland, Geneva, Zurich, Amsterdam, Netherlands..." required />
        </label>
        <label className={labelClass}>Languages spoken
          <input name="languagesSpoken" className={fieldClass} value={languagesSpoken} onChange={(event) => setLanguagesSpoken(event.target.value)} placeholder="English, French, Spanish..." required />
        </label>
        <label className={labelClass}>Internship start date
          <input name="internshipStartDate" className={fieldClass} value={internshipStartDate} onChange={(event) => setInternshipStartDate(event.target.value)} placeholder="September 2026, flexible" />
        </label>
        <label className={labelClass}>Internship duration
          <input name="internshipDuration" className={fieldClass} value={internshipDuration} onChange={(event) => setInternshipDuration(event.target.value)} placeholder="4-6 months, flexible" />
        </label>
        <label className={`${labelClass} md:col-span-2`}>Companies already applied to
          <input name="companiesAlreadyAppliedTo" className={fieldClass} value={companiesAlreadyAppliedTo} onChange={(event) => setCompaniesAlreadyAppliedTo(event.target.value)} placeholder="Company A, Company B, anything we should avoid repeating" />
        </label>
      </div>

      <label className={labelClass}>Profile / CV summary
        <textarea name="profileSummary" className={`${fieldClass} min-h-32`} value={profileSummary} onChange={(event) => setProfileSummary(event.target.value)} placeholder="Your school, experience, strengths, target role and anything that makes your profile stand out." />
      </label>
      <label className={labelClass}>Ideal internship / dream role
        <textarea name="idealInternshipDescription" className={`${fieldClass} min-h-32`} value={idealInternshipDescription} onChange={(event) => setIdealInternshipDescription(event.target.value)} placeholder="What would make an internship genuinely exciting enough to open?" />
      </label>
      <label className={labelClass}>Things to avoid
        <textarea name="thingsToAvoid" className={`${fieldClass} min-h-28`} value={thingsToAvoid} onChange={(event) => setThingsToAvoid(event.target.value)} placeholder="Unpaid roles, specific companies, industries, cities, senior roles, generic sales roles..." />
      </label>

      <button type="submit" disabled={loading} className="button-primary w-full sm:w-auto">
        {loading ? "Saving and opening checkout..." : "Continue to payment — €5.90"}
      </button>
    </form>
  );
}
