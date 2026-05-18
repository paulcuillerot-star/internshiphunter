"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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

  return <section className="section"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase text-signal">Create your search</p><h1 className="mt-3 text-4xl font-bold text-ink">Tell us what a useful internship looks like.</h1><p className="mt-3 text-ink/70">The first version accepts PDFs and uses mock CV extraction until a real parser is added.</p></div><form onSubmit={submit} className="mt-8 grid max-w-4xl gap-5 rounded-lg border border-line bg-white p-5 shadow-soft">{error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-5 md:grid-cols-2"><label className="grid gap-2"><span className="label">First name</span><input className="field" name="firstName" placeholder="Alex" /></label><label className="grid gap-2"><span className="label">Email Required</span><input className="field" name="email" type="email" required placeholder="alex@example.com" /></label></div><label className="grid gap-2"><span className="label">CV upload, PDF only Required</span><input className="field" name="cv" type="file" accept="application/pdf" required /></label><div className="grid gap-5 md:grid-cols-2"><input className="field" name="targetCountries" required placeholder="Target countries: Switzerland, Singapore" /><input className="field" name="targetCities" placeholder="Target cities: Geneva, Lausanne" /><input className="field" name="targetIndustries" placeholder="Industries: Sport, Events, Marketing" /><input className="field" name="desiredRoles" required placeholder="Roles: Marketing intern, Partnerships intern" /><input className="field" name="internshipStartDate" type="month" /><input className="field" name="internshipDuration" placeholder="6 months" /><input className="field" name="languagesSpoken" placeholder="English, French" /><input className="field" name="minimumCompensation" placeholder="Paid preferred" /></div><input className="field" name="companiesAlreadyAppliedTo" placeholder="Companies already applied to" /><textarea className="field min-h-28" name="idealInternshipDescription" placeholder="Ideal internship description" /><textarea className="field min-h-24" name="thingsToAvoid" placeholder="Things to avoid" /><button type="submit" disabled={loading} className="button-primary w-full sm:w-fit">{loading ? "Searching..." : "Generate my free report"}</button></form></section>;
}
