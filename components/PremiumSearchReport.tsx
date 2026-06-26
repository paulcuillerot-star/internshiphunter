import type { PremiumSearchInputs, ScoredInternshipOffer } from "@/lib/types";

type SearchReportVariant = "results" | "alternatives" | "empty";

type ParsedDiagnostics = {
  offersDetected?: string;
  offersRejected?: string;
  finalStrongMatches?: string;
  reasons: string[];
  strategy?: string;
};

const reasonLabels: Record<string, string> = {
  archived_or_closed: "Closed or archived",
  unreachable_url: "Unreachable link",
  weak_aggregator: "Weak job board or aggregator",
  expired_deadline: "Expired deadline",
  language_incompatible: "Language mismatch",
  wrong_role_family: "Wrong role type",
  hard_filter_violation: "Did not respect your hard filters",
  stale_posting: "Old or stale posting",
  senior_or_full_time: "Too senior or full-time",
  not_internship: "Not an internship",
  alternance_excluded: "Alternance excluded",
  technical_role_excluded: "Technical role excluded",
  mechanic_role_excluded: "Mechanic role excluded",
  duplicate: "Duplicate posting"
};

const strategyLabels: Record<string, string> = {
  broaden_locations: "We kept your role and included nearby locations.",
  broaden_roles: "We broadened the role family while keeping your hard filters.",
  relax_one_hard_filter: "We softened one lower-priority filter while keeping the search intent.",
  include_nearby_industries: "We kept the role fit and included nearby industries.",
  broader_company_sources: "We checked broader company and ATS sources while avoiding weak listings."
};

function cleanToken(value: string) {
  return value.trim().replace(/[.]+$/g, "").replace(/_/g, " ");
}

function labelReason(reason: string) {
  const normalized = reason.trim().replace(/[.]+$/g, "");
  return reasonLabels[normalized] ?? cleanToken(normalized).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseDiagnostics(errorMessage?: string): ParsedDiagnostics {
  const text = errorMessage ?? "";
  const rawReasons = text.match(/main_rejection_reasons=([^;]+)/)?.[1] ?? "";
  const strategy = text.match(/\[strategy:([^\]]+)\]/)?.[1]?.trim();

  return {
    offersDetected: text.match(/offers_detected=([^;]+)/)?.[1]?.trim(),
    offersRejected: text.match(/offers_rejected=([^;]+)/)?.[1]?.trim(),
    finalStrongMatches: text.match(/final_strong_matches=([^.;]+)/)?.[1]?.trim(),
    reasons: rawReasons
      .split(/[,|]/)
      .map((reason) => reason.trim())
      .filter(Boolean)
      .slice(0, 4),
    strategy
  };
}

function compactList(values?: string[]) {
  return values?.map((value) => value.trim()).filter(Boolean) ?? [];
}

function searchedFor(inputs?: PremiumSearchInputs) {
  if (!inputs) return "Your saved premium criteria";

  const roles = compactList(inputs.targetRoles?.length ? inputs.targetRoles : inputs.rolePriority);
  const industries = compactList(inputs.targetIndustries);
  const cities = compactList(inputs.strictCities?.length ? inputs.strictCities : inputs.targetCities);
  const countries = compactList(inputs.acceptableCountries?.length ? inputs.acceptableCountries : inputs.targetCountries);
  const parts = [roles.slice(0, 2).join(" or "), industries.slice(0, 2).join(" or "), [...cities, ...countries].slice(0, 3).join(", ")].filter(Boolean);

  return parts.length ? parts.join(" in ") : "Your saved premium criteria";
}

function bestNextMove({ variant, diagnostics, inputs }: { variant: SearchReportVariant; diagnostics: ParsedDiagnostics; inputs?: PremiumSearchInputs }) {
  if (diagnostics.strategy && strategyLabels[diagnostics.strategy]) return strategyLabels[diagnostics.strategy];

  const hardFilters = compactList(inputs?.hardFilters).join(" ").toLowerCase();
  if (hardFilters.includes("technical") || hardFilters.includes("mechanic")) return "Avoid broadening into technical roles because you excluded them.";
  if (variant === "results") return "Review the strongest opportunities first while they are still live.";
  if (variant === "alternatives") return "Keep your location, but broaden the industry first.";
  return "Come back later if you want to run a broader search.";
}

function reportCopy(variant: SearchReportVariant) {
  if (variant === "results") {
    return "We searched your criteria and verified the strongest opportunities before showing them to you.";
  }

  if (variant === "alternatives") {
    return "We searched your exact criteria first. Your perfect internship does not seem to be posted today. Then we checked the closest alternatives and kept only the useful ones.";
  }

  return "We searched your exact criteria and the closest alternatives. We filtered out weak, expired, unreachable or irrelevant offers. Nothing worth applying to appears to be live right now.";
}

export function PremiumSearchReport({
  variant,
  inputs,
  offers = [],
  errorMessage,
  retryAvailable = false
}: {
  variant: SearchReportVariant;
  inputs?: PremiumSearchInputs;
  offers?: ScoredInternshipOffer[];
  errorMessage?: string;
  retryAvailable?: boolean;
}) {
  const diagnostics = parseDiagnostics(errorMessage);
  const exactMatches = offers.filter((offer) => offer.matchType === "exact").length;
  const closestAlternatives = offers.filter((offer) => offer.matchType === "close" || offer.matchType === "broadened").length;
  const metrics = [
    { label: "Searches run", value: retryAvailable ? "1" : diagnostics.strategy ? "2" : variant === "results" ? "1+" : undefined },
    { label: "Offers checked", value: diagnostics.offersDetected },
    { label: "Offers filtered out", value: diagnostics.offersRejected },
    { label: "Exact matches", value: exactMatches > 0 ? String(exactMatches) : diagnostics.finalStrongMatches },
    { label: "Closest alternatives", value: closestAlternatives > 0 ? String(closestAlternatives) : undefined }
  ].filter((metric) => metric.value && metric.value !== "Not available");
  const reasons = diagnostics.reasons.map(labelReason);

  return (
    <section className="mt-8 rounded-lg border border-emerald-100 bg-white p-6 shadow-soft sm:p-8">
      <p className="text-sm font-semibold uppercase text-signal">Your search report</p>
      <h2 className="mt-3 text-2xl font-black text-ink">Here is what we checked.</h2>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/70">{reportCopy(variant)}</p>
      {variant !== "results" ? <p className="mt-3 text-sm font-semibold text-emerald-900">You are not missing an obvious perfect match today.</p> : null}

      <div className="mt-6 rounded-md bg-mist p-4">
        <p className="text-xs font-bold uppercase text-ink/45">Searched for</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink">{searchedFor(inputs)}</p>
      </div>

      {metrics.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-md bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700/70">{metric.label}</p>
              <p className="mt-2 text-2xl font-black text-ink">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-black text-ink">Sources checked</p>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-ink/65">
            <li>Web search</li>
            <li>Public job board results</li>
            <li>Company career pages</li>
            <li>ATS platforms</li>
            <li>LinkedIn-indexed results when available</li>
            <li>Closest alternatives</li>
          </ul>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm font-black text-ink">Best next move</p>
          <p className="mt-3 text-sm leading-6 text-ink/65">{bestNextMove({ variant, diagnostics, inputs })}</p>
          {diagnostics.strategy ? <p className="mt-3 text-xs font-semibold uppercase text-ink/45">Closest alternative strategy used: {cleanToken(diagnostics.strategy)}</p> : null}
        </div>
      </div>

      {reasons.length > 0 ? (
        <div className="mt-5 rounded-md bg-ink/5 p-4">
          <p className="text-sm font-black text-ink">Top rejection reasons</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink/65 ring-1 ring-line">{reason}</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
