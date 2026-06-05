"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { PremiumSearchInputs } from "@/lib/types";

function joinList(items?: string[]) {
  return items?.join(", ") ?? "";
}

export function PremiumSearchForm({ reportId, accessToken, initialInputs, paymentCancelled = false }: { reportId: string; accessToken?: string; initialInputs?: PremiumSearchInputs; paymentCancelled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      reportId,
      token: accessToken,
      premiumInputs: {
        targetCountries: String(formData.get("targetCountries") ?? ""),
        targetCities: String(formData.get("targetCities") ?? ""),
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
    <form onSubmit={submit} className="mt-8 grid gap-5 rounded-lg border border-line bg-white p-6 shadow-soft">
      {paymentCancelled ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Payment was cancelled. Your premium criteria are saved; you can continue to payment when ready.</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div>
        <p className="text-sm font-semibold uppercase text-signal">Premium personalization</p>
        <h2 className="mt-2 text-2xl font-bold text-ink">Tell us what the paid search should target</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Your email is already linked to the free report. These details are saved before payment and used once the secure Stripe confirmation arrives.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">Target countries
          <input name="targetCountries" className="input" defaultValue={joinList(initialInputs?.targetCountries)} placeholder="Switzerland, Netherlands, Germany" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Target cities
          <input name="targetCities" className="input" defaultValue={joinList(initialInputs?.targetCities)} placeholder="Zurich, Amsterdam, Berlin" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Languages spoken
          <input name="languagesSpoken" className="input" defaultValue={joinList(initialInputs?.languagesSpoken)} placeholder="English, French" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Internship start date
          <input name="internshipStartDate" className="input" defaultValue={initialInputs?.internshipStartDate ?? ""} placeholder="September 2026, flexible" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Internship duration
          <input name="internshipDuration" className="input" defaultValue={initialInputs?.internshipDuration ?? ""} placeholder="4-6 months" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Companies already applied to
          <input name="companiesAlreadyAppliedTo" className="input" defaultValue={joinList(initialInputs?.companiesAlreadyAppliedTo)} placeholder="Company A, Company B" />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-ink">Profile / CV summary
        <textarea name="profileSummary" className="input min-h-28" defaultValue={initialInputs?.profileSummary ?? ""} placeholder="Short summary of your background, school, experience, strengths and target role." />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-ink">Ideal internship / dream role
        <textarea name="idealInternshipDescription" className="input min-h-28" defaultValue={initialInputs?.idealInternshipDescription ?? ""} placeholder="What would make an opportunity genuinely exciting for you?" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-ink">Things to avoid
        <textarea name="thingsToAvoid" className="input min-h-24" defaultValue={initialInputs?.thingsToAvoid ?? ""} placeholder="Unpaid roles, specific companies, industries, cities, role types, senior roles..." />
      </label>

      <button type="submit" disabled={loading} className="button-primary w-full sm:w-auto">
        {loading ? "Saving and opening checkout..." : "Continue to payment"}
      </button>
    </form>
  );
}
