"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { PremiumSearchInputs } from "@/lib/types";

const fieldClass = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink/35 focus:border-signal focus:ring-4 focus:ring-signal/10";
const labelClass = "grid gap-2 text-sm font-bold text-ink";
const showTestPreset = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_PREMIUM_TEST_PRESET === "true";

const defaultBroadeningOrder = [
  "Nearby cities",
  "Same role in broader industries",
  "Adjacent commercial/business roles",
  "Broader high-signal companies"
];

const expansionOptions = ["Nearby cities", "Similar roles", "Similar industries", "Recognized companies", "Don't expand"];

const testPreset = {
  rolesWanted: "Business development, Partnerships, Sponsorship, Marketing, Event management",
  locationsWanted: "Paris, France, Geneva, Switzerland, Brussels, Belgium",
  targetIndustries: "Sports, Events, Consumer brands, SaaS, Hospitality",
  languagesSpoken: "French fluent, English fluent, Spanish professional",
  timing: "September 2026, 4-6 months",
  durationStrictness: "flexible",
  companiesAlreadyAppliedTo: "Nike, L'Oreal, Chanel",
  hardFilters: "No Dutch-required roles, no pure data analytics, no accounting, no coding-heavy roles, no German-only roles, no senior roles, no internships longer than 6 months",
  softPreferences: "Fast-growing company, sports or events context, client meetings, commercial reporting, partnership activation",
  expansionPreference: ["Nearby cities", "Similar roles", "Recognized companies"],
  profileSummary:
    "Business school master student at SKEMA with experience in business development, e-retail, category management, sports fan experience and event coordination. Strong skills in commercial analysis, sales support, partnerships, project coordination and client relationship management.",
  idealInternshipDescription:
    "A 4-6 month internship starting around September 2026 in business development, sales, partnerships, sponsorship, marketing or event management. Ideally in tech, sport, events, consumer brands, SaaS, hospitality or a fast-growing company."
};

function joinList(items?: string[]) {
  return items?.join(", ") ?? "";
}

function combineLocations(initialInputs?: PremiumSearchInputs) {
  return joinList([...(initialInputs?.strictCities ?? initialInputs?.targetCities ?? []), ...(initialInputs?.acceptableCountries ?? initialInputs?.targetCountries ?? [])]);
}

function combineTiming(initialInputs?: PremiumSearchInputs) {
  return [initialInputs?.internshipStartDate, initialInputs?.internshipDuration].filter(Boolean).join(", ");
}

function durationStrictnessValue(initialInputs?: PremiumSearchInputs) {
  return initialInputs?.durationStrictness ?? "flexible";
}

function broadeningOrderFromSelection(selection: string[]) {
  if (selection.includes("Don't expand")) return ["Do not expand beyond the requested criteria"];
  if (!selection.length) return defaultBroadeningOrder;

  const mapped = selection.map((item) => {
    if (item === "Similar roles") return "Adjacent commercial/business roles";
    if (item === "Similar industries") return "Same role in broader industries";
    if (item === "Recognized companies") return "Broader high-signal companies";
    return item;
  });

  return Array.from(new Set(mapped));
}

export function PremiumSearchForm({ reportId, accessToken, initialInputs, paymentCancelled = false }: { reportId: string; accessToken?: string; initialInputs?: PremiumSearchInputs; paymentCancelled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rolesWanted, setRolesWanted] = useState(joinList(initialInputs?.rolePriority?.length ? initialInputs.rolePriority : initialInputs?.targetRoles));
  const [locationsWanted, setLocationsWanted] = useState(combineLocations(initialInputs));
  const [languagesSpoken, setLanguagesSpoken] = useState(joinList(initialInputs?.languagesSpoken));
  const [timing, setTiming] = useState(combineTiming(initialInputs));
  const [hardFilters, setHardFilters] = useState(joinList(initialInputs?.hardFilters) || initialInputs?.thingsToAvoid || "");
  const [targetIndustries, setTargetIndustries] = useState(joinList(initialInputs?.targetIndustries));
  const [companiesAlreadyAppliedTo, setCompaniesAlreadyAppliedTo] = useState(joinList(initialInputs?.companiesAlreadyAppliedTo));
  const [remoteAccepted, setRemoteAccepted] = useState(Boolean(initialInputs?.remoteAccepted));
  const [durationStrictness, setDurationStrictness] = useState<"strict" | "flexible">(durationStrictnessValue(initialInputs));
  const [softPreferences, setSoftPreferences] = useState(joinList(initialInputs?.softPreferences));
  const [expansionPreference, setExpansionPreference] = useState<string[]>(initialInputs?.broadeningOrder?.length ? initialInputs.broadeningOrder : []);
  const profileSummary = initialInputs?.profileSummary ?? "";
  const idealInternshipDescription = initialInputs?.idealInternshipDescription ?? "";

  const broadeningOrder = useMemo(() => broadeningOrderFromSelection(expansionPreference), [expansionPreference]);

  function toggleExpansionPreference(option: string) {
    setExpansionPreference((current) => {
      if (option === "Don't expand") return current.includes(option) ? [] : [option];
      const withoutNoExpand = current.filter((item) => item !== "Don't expand");
      return withoutNoExpand.includes(option) ? withoutNoExpand.filter((item) => item !== option) : [...withoutNoExpand, option];
    });
  }

  function applyTestPreset() {
    setRolesWanted(testPreset.rolesWanted);
    setLocationsWanted(testPreset.locationsWanted);
    setTargetIndustries(testPreset.targetIndustries);
    setRemoteAccepted(false);
    setLanguagesSpoken(testPreset.languagesSpoken);
    setTiming(testPreset.timing);
    setDurationStrictness("flexible");
    setCompaniesAlreadyAppliedTo(testPreset.companiesAlreadyAppliedTo);
    setHardFilters(testPreset.hardFilters);
    setSoftPreferences(testPreset.softPreferences);
    setExpansionPreference(testPreset.expansionPreference);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const generatedIdeal = idealInternshipDescription || [rolesWanted, targetIndustries, softPreferences].filter(Boolean).join(". ");
    const payload = {
      reportId,
      token: accessToken,
      premiumInputs: {
        targetRoles: rolesWanted,
        rolePriority: rolesWanted,
        targetIndustries,
        targetCountries: locationsWanted,
        targetCities: "",
        strictCities: locationsWanted,
        acceptableCountries: locationsWanted,
        remoteAccepted: String(remoteAccepted),
        languagesSpoken,
        internshipStartDate: timing,
        internshipDuration: timing,
        durationStrictness,
        companiesAlreadyAppliedTo,
        hardFilters,
        softPreferences,
        broadeningOrder: broadeningOrder.join(", "),
        thingsToAvoid: hardFilters,
        profileSummary,
        idealInternshipDescription: generatedIdeal
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
        <h2 className="mt-2 text-2xl font-black text-ink">Spend 2 minutes here, not 5 hours on LinkedIn</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Give us the essentials. We turn them into a structured search brief for the live premium search.</p>
        {showTestPreset ? (
          <button type="button" onClick={applyTestPreset} className="mt-4 inline-flex button-secondary">
            Use test preset
          </button>
        ) : null}
      </div>

      <div className="grid gap-4">
        <label className={labelClass}>What kind of internship are you looking for?
          <input name="targetRoles" className={fieldClass} value={rolesWanted} onChange={(event) => setRolesWanted(event.target.value)} placeholder="Marketing, Business Development, Partnerships, Events..." required />
        </label>
        <label className={labelClass}>Where do you want to work?
          <input name="locationsWanted" className={fieldClass} value={locationsWanted} onChange={(event) => setLocationsWanted(event.target.value)} placeholder="Paris, Amsterdam, Spain, Switzerland..." required />
        </label>
        <label className={labelClass}>Which languages can you work in?
          <input name="languagesSpoken" className={fieldClass} value={languagesSpoken} onChange={(event) => setLanguagesSpoken(event.target.value)} placeholder="French, English, Spanish..." required />
        </label>
        <label className={labelClass}>When can you start, and for how long?
          <input name="timing" className={fieldClass} value={timing} onChange={(event) => setTiming(event.target.value)} placeholder="September 2026, 6 months" required />
        </label>
        <label className={labelClass}>Anything we should avoid?
          <textarea name="hardFilters" className={`${fieldClass} min-h-24`} value={hardFilters} onChange={(event) => setHardFilters(event.target.value)} placeholder="No finance, no unpaid roles, no German, no data analyst..." />
        </label>
      </div>

      <details className="rounded-2xl border border-line bg-white/70 p-4">
        <summary className="cursor-pointer text-sm font-black text-ink">Want sharper results? Add advanced filters.</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>Preferred industries
            <input name="targetIndustries" className={fieldClass} value={targetIndustries} onChange={(event) => setTargetIndustries(event.target.value)} placeholder="Sports, luxury, SaaS, events, consumer brands..." />
          </label>
          <label className={`${labelClass} md:col-span-2`}>Companies already applied to
            <input name="companiesAlreadyAppliedTo" className={fieldClass} value={companiesAlreadyAppliedTo} onChange={(event) => setCompaniesAlreadyAppliedTo(event.target.value)} placeholder="Nike, L'Oreal, Chanel..." />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            <span className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 font-bold text-ink">
              <input name="remoteAccepted" type="checkbox" checked={remoteAccepted} onChange={(event) => setRemoteAccepted(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Remote or hybrid accepted
            </span>
          </label>
          <label className={labelClass}>Duration flexibility
            <select name="durationStrictness" className={fieldClass} value={durationStrictness} onChange={(event) => setDurationStrictness(event.target.value as "strict" | "flexible")}>
              <option value="flexible">Flexible</option>
              <option value="strict">Strict</option>
            </select>
          </label>
          <label className={`${labelClass} md:col-span-2`}>Soft preferences
            <textarea name="softPreferences" className={`${fieldClass} min-h-24`} value={softPreferences} onChange={(event) => setSoftPreferences(event.target.value)} placeholder="Prestigious brands, client-facing role, sports context, startup environment..." />
          </label>
          <div className="grid gap-3 md:col-span-2">
            <p className="text-sm font-bold text-ink">Expansion preference</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {expansionOptions.map((option) => (
                <label key={option} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink">
                  <input type="checkbox" checked={expansionPreference.includes(option)} onChange={() => toggleExpansionPreference(option)} className="h-4 w-4 accent-emerald-600" />
                  {option}
                </label>
              ))}
            </div>
            <p className="text-xs leading-5 text-ink/60">If you skip this, we broaden in this order: nearby cities, broader industries, adjacent business roles, then recognized companies.</p>
          </div>
        </div>
      </details>

      <button type="submit" disabled={loading} className="button-primary w-full sm:w-auto">
        {loading ? "Saving and opening checkout..." : "Continue to payment — €5.90"}
      </button>
    </form>
  );
}
