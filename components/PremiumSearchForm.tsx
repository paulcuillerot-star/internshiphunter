"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { PremiumSearchInputs } from "@/lib/types";

const fieldClass = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink/35 focus:border-signal focus:ring-4 focus:ring-signal/10";
const labelClass = "grid gap-2 text-sm font-bold text-ink";
const showTestPreset = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_PREMIUM_TEST_PRESET === "true";

const testPreset = {
  targetRoles: "Business development, Partnerships, Sponsorship, Marketing, Event management",
  rolePriority: "Partnerships, Business development, Marketing",
  targetIndustries: "Sports, Events, Consumer brands, SaaS, Hospitality",
  targetCountries: "France, Switzerland, Belgium",
  targetCities: "Paris, Geneva, Brussels",
  languagesSpoken: "French fluent, English fluent, Spanish professional",
  internshipStartDate: "September 2026",
  internshipDuration: "4-6 months",
  durationStrictness: "flexible",
  companiesAlreadyAppliedTo: "Nike, L'Oréal, Chanel",
  hardFilters: "No Dutch-required roles, no pure data analytics, no accounting, no coding-heavy roles, no German-only roles, no senior roles, no internships longer than 6 months",
  softPreferences: "Fast-growing company, sports or events context, client meetings, commercial reporting, partnership activation",
  broadeningOrder: "1. Same role in nearby cities, 2. Adjacent commercial roles, 3. Nearby countries, 4. Broader high-signal companies",
  profileSummary:
    "Business school master student at SKEMA with experience in business development, e-retail, category management, sports fan experience and event coordination. Strong skills in commercial analysis, sales support, partnerships, project coordination and client relationship management.",
  idealInternshipDescription:
    "A 4-6 month internship starting around September 2026 in business development, sales, partnerships, sponsorship, marketing or event management. Ideally in tech, sport, events, consumer brands, SaaS, hospitality or a fast-growing company. The role should include prospecting, account management, partnership activation, market research, client meetings, commercial reporting or campaign coordination."
};

function joinList(items?: string[]) {
  return items?.join(", ") ?? "";
}

function durationStrictnessValue(initialInputs?: PremiumSearchInputs) {
  return initialInputs?.durationStrictness ?? "flexible";
}

export function PremiumSearchForm({ reportId, accessToken, initialInputs, paymentCancelled = false }: { reportId: string; accessToken?: string; initialInputs?: PremiumSearchInputs; paymentCancelled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [targetRoles, setTargetRoles] = useState(joinList(initialInputs?.targetRoles));
  const [rolePriority, setRolePriority] = useState(joinList(initialInputs?.rolePriority));
  const [targetIndustries, setTargetIndustries] = useState(joinList(initialInputs?.targetIndustries));
  const [targetCountries, setTargetCountries] = useState(joinList(initialInputs?.acceptableCountries ?? initialInputs?.targetCountries));
  const [targetCities, setTargetCities] = useState(joinList(initialInputs?.strictCities ?? initialInputs?.targetCities));
  const [remoteAccepted, setRemoteAccepted] = useState(Boolean(initialInputs?.remoteAccepted));
  const [languagesSpoken, setLanguagesSpoken] = useState(joinList(initialInputs?.languagesSpoken));
  const [internshipStartDate, setInternshipStartDate] = useState(initialInputs?.internshipStartDate ?? "");
  const [internshipDuration, setInternshipDuration] = useState(initialInputs?.internshipDuration ?? "");
  const [durationStrictness, setDurationStrictness] = useState<"strict" | "flexible">(durationStrictnessValue(initialInputs));
  const [companiesAlreadyAppliedTo, setCompaniesAlreadyAppliedTo] = useState(joinList(initialInputs?.companiesAlreadyAppliedTo));
  const [hardFilters, setHardFilters] = useState(joinList(initialInputs?.hardFilters) || initialInputs?.thingsToAvoid || "");
  const [softPreferences, setSoftPreferences] = useState(joinList(initialInputs?.softPreferences));
  const [broadeningOrder, setBroadeningOrder] = useState(joinList(initialInputs?.broadeningOrder));
  const [profileSummary, setProfileSummary] = useState(initialInputs?.profileSummary ?? "");
  const [idealInternshipDescription, setIdealInternshipDescription] = useState(initialInputs?.idealInternshipDescription ?? "");

  function applyTestPreset() {
    setTargetRoles(testPreset.targetRoles);
    setRolePriority(testPreset.rolePriority);
    setTargetIndustries(testPreset.targetIndustries);
    setTargetCountries(testPreset.targetCountries);
    setTargetCities(testPreset.targetCities);
    setRemoteAccepted(false);
    setLanguagesSpoken(testPreset.languagesSpoken);
    setInternshipStartDate(testPreset.internshipStartDate);
    setInternshipDuration(testPreset.internshipDuration);
    setDurationStrictness("flexible");
    setCompaniesAlreadyAppliedTo(testPreset.companiesAlreadyAppliedTo);
    setHardFilters(testPreset.hardFilters);
    setSoftPreferences(testPreset.softPreferences);
    setBroadeningOrder(testPreset.broadeningOrder);
    setProfileSummary(testPreset.profileSummary);
    setIdealInternshipDescription(testPreset.idealInternshipDescription);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      reportId,
      token: accessToken,
      premiumInputs: {
        targetRoles: String(formData.get("targetRoles") ?? ""),
        rolePriority: String(formData.get("rolePriority") ?? ""),
        targetIndustries: String(formData.get("targetIndustries") ?? ""),
        targetCountries: String(formData.get("targetCountries") ?? ""),
        targetCities: String(formData.get("targetCities") ?? ""),
        strictCities: String(formData.get("targetCities") ?? ""),
        acceptableCountries: String(formData.get("targetCountries") ?? ""),
        remoteAccepted: String(formData.get("remoteAccepted") ?? ""),
        languagesSpoken: String(formData.get("languagesSpoken") ?? ""),
        internshipStartDate: String(formData.get("internshipStartDate") ?? ""),
        internshipDuration: String(formData.get("internshipDuration") ?? ""),
        durationStrictness: String(formData.get("durationStrictness") ?? "flexible"),
        companiesAlreadyAppliedTo: String(formData.get("companiesAlreadyAppliedTo") ?? ""),
        hardFilters: String(formData.get("hardFilters") ?? ""),
        softPreferences: String(formData.get("softPreferences") ?? ""),
        broadeningOrder: String(formData.get("broadeningOrder") ?? ""),
        thingsToAvoid: String(formData.get("hardFilters") ?? ""),
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
        <h2 className="mt-2 text-2xl font-black text-ink">Build the search brief</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Answer like you would brief a strong internship researcher. The more precise the brief, the better the live search.</p>
        {showTestPreset ? (
          <button type="button" onClick={applyTestPreset} className="mt-4 inline-flex button-secondary">
            Use test preset
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${labelClass} md:col-span-2`}>What roles are you looking for?
          <input name="targetRoles" className={fieldClass} value={targetRoles} onChange={(event) => setTargetRoles(event.target.value)} placeholder="Marketing, business development, partnerships, events..." required />
        </label>
        <label className={`${labelClass} md:col-span-2`}>Rank your top role families
          <input name="rolePriority" className={fieldClass} value={rolePriority} onChange={(event) => setRolePriority(event.target.value)} placeholder="1. Partnerships, 2. Business development, 3. Marketing" />
        </label>
        <label className={`${labelClass} md:col-span-2`}>Target industries
          <input name="targetIndustries" className={fieldClass} value={targetIndustries} onChange={(event) => setTargetIndustries(event.target.value)} placeholder="Sports, luxury, SaaS, events, consumer brands..." />
        </label>
        <label className={labelClass}>Acceptable countries
          <input name="targetCountries" className={fieldClass} value={targetCountries} onChange={(event) => setTargetCountries(event.target.value)} placeholder="France, Switzerland, Netherlands..." required />
        </label>
        <label className={labelClass}>Strict or preferred cities
          <input name="targetCities" className={fieldClass} value={targetCities} onChange={(event) => setTargetCities(event.target.value)} placeholder="Paris, Geneva, Amsterdam..." />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          <span className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 font-bold text-ink">
            <input name="remoteAccepted" type="checkbox" checked={remoteAccepted} onChange={(event) => setRemoteAccepted(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Remote or hybrid roles are acceptable
          </span>
        </label>
        <label className={`${labelClass} md:col-span-2`}>Which languages can you work in?
          <input name="languagesSpoken" className={fieldClass} value={languagesSpoken} onChange={(event) => setLanguagesSpoken(event.target.value)} placeholder="French fluent, English professional, Spanish intermediate..." required />
        </label>
        <label className={labelClass}>Internship start date
          <input name="internshipStartDate" className={fieldClass} value={internshipStartDate} onChange={(event) => setInternshipStartDate(event.target.value)} placeholder="September 2026, flexible" />
        </label>
        <label className={labelClass}>Internship duration
          <input name="internshipDuration" className={fieldClass} value={internshipDuration} onChange={(event) => setInternshipDuration(event.target.value)} placeholder="4-6 months" />
        </label>
        <label className={labelClass}>Duration strictness
          <select name="durationStrictness" className={fieldClass} value={durationStrictness} onChange={(event) => setDurationStrictness(event.target.value as "strict" | "flexible")}>
            <option value="flexible">Flexible</option>
            <option value="strict">Strict</option>
          </select>
        </label>
        <label className={labelClass}>Companies already applied to
          <input name="companiesAlreadyAppliedTo" className={fieldClass} value={companiesAlreadyAppliedTo} onChange={(event) => setCompaniesAlreadyAppliedTo(event.target.value)} placeholder="Nike, L'Oréal, Chanel..." />
        </label>
      </div>

      <label className={labelClass}>What should we absolutely avoid?
        <textarea name="hardFilters" className={`${fieldClass} min-h-28`} value={hardFilters} onChange={(event) => setHardFilters(event.target.value)} placeholder="No Dutch-required roles, no pure data analytics, no accounting, no coding-heavy roles..." />
      </label>
      <label className={labelClass}>Soft preferences
        <textarea name="softPreferences" className={`${fieldClass} min-h-24`} value={softPreferences} onChange={(event) => setSoftPreferences(event.target.value)} placeholder="Prestigious brands, client-facing role, sports context, startup environment..." />
      </label>
      <label className={labelClass}>If we cannot find 3 exact matches, what should we broaden first?
        <textarea name="broadeningOrder" className={`${fieldClass} min-h-24`} value={broadeningOrder} onChange={(event) => setBroadeningOrder(event.target.value)} placeholder="1. Nearby cities, 2. Adjacent roles, 3. Nearby countries, 4. Broader industries" />
      </label>
      <label className={labelClass}>Profile / CV summary
        <textarea name="profileSummary" className={`${fieldClass} min-h-28`} value={profileSummary} onChange={(event) => setProfileSummary(event.target.value)} placeholder="Your school, experience, strengths and anything that makes your profile stand out." />
      </label>
      <label className={labelClass}>Ideal internship / dream role
        <textarea name="idealInternshipDescription" className={`${fieldClass} min-h-28`} value={idealInternshipDescription} onChange={(event) => setIdealInternshipDescription(event.target.value)} placeholder="What would make an internship genuinely exciting enough to open?" />
      </label>

      <button type="submit" disabled={loading} className="button-primary w-full sm:w-auto">
        {loading ? "Saving and opening checkout..." : "Continue to payment — €5.90"}
      </button>
    </form>
  );
}
