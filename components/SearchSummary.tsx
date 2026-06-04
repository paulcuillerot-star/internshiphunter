import type { CandidateProfile } from "@/lib/types";

export function SearchSummary({ profile }: { profile: CandidateProfile }) {
  const rows = [
    ["Target market", profile.targetCountries.join(", ") || "Europe"],
    ["Internship track", profile.desiredRoles.join(", ")],
    ["Premium personalization", "CV, exact cities, languages, dates, duration and exclusions are reserved for premium search"]
  ];

  return <section className="rounded-lg border border-line bg-mist p-5"><h2 className="text-lg font-bold text-ink">Search summary</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-ink/50">{label}</dt><dd className="mt-1 text-sm text-ink">{value}</dd></div>)}</dl></section>;
}
