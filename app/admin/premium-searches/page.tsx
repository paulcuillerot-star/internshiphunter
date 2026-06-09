import Link from "next/link";
import { CopyButton } from "./CopyButton";
import { getProfile, listLogs, listReports } from "@/lib/store";
import type { AdminSearchLog, InternshipSearchReport, PremiumSearchBrief, PremiumSearchInputs } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Filter = "active" | "paid" | "completed" | "failed" | "ready_to_run" | "legacy_test" | "anomalies" | "all";
type ReportRow = { report: InternshipSearchReport; email: string; logs: AdminSearchLog[] };
type PremiumOffer = InternshipSearchReport["premiumOffers"][number];

const filters: Array<{ id: Filter; label: string }> = [
  { id: "active", label: "Active premium reports" },
  { id: "paid", label: "Paid" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "ready_to_run", label: "Ready to run" },
  { id: "legacy_test", label: "Legacy / test reports" },
  { id: "anomalies", label: "Anomalies" },
  { id: "all", label: "All" }
];

const weakSourceHosts = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "stage.fr",
  "jobteaser.com",
  "welcometothejungle.com",
  "talent.com",
  "jooble.org",
  "simplyhired.com",
  "monster.com",
  "google.com",
  "bing.com"
];

function isAuthorized(password?: string) {
  const configuredPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
  const isLocalDev = process.env.NODE_ENV !== "production";
  return configuredPassword ? password === configuredPassword : isLocalDev;
}

function dashboardHref(password?: string, filter: Filter = "active", reportId?: string) {
  const params = new URLSearchParams();
  if (password) params.set("password", password);
  if (filter !== "active") params.set("filter", filter);
  if (reportId) params.set("report", reportId);
  const query = params.toString();
  return `/admin/premium-searches${query ? `?${query}` : ""}`;
}

function premiumReportHref(report: InternshipSearchReport) {
  const params = new URLSearchParams();
  if (report.accessToken) params.set("token", report.accessToken);
  params.set("refresh", String(Date.now()));
  const query = params.toString();
  return `/premium/${report.id}${query ? `?${query}` : ""}`;
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function timestamp(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function statusClass(status?: string) {
  if (status === "completed") return "bg-emerald-50 text-signal ring-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "running" || status === "ready_to_run") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function warningClass(kind = "warning") {
  if (kind === "danger") return "bg-red-50 text-red-700 ring-red-200";
  if (kind === "neutral") return "bg-ink/5 text-ink/70 ring-ink/10";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function premiumStatus(report: InternshipSearchReport) {
  return report.premiumSearchStatus ?? "not_started";
}

function isPremiumReport(report: InternshipSearchReport) {
  const status = premiumStatus(report);
  return Boolean(report.isPaid || report.premiumInputs || report.premiumOffers.length || status !== "not_started");
}

function isActivePremiumReport(report: InternshipSearchReport) {
  return Boolean(report.isPaid || report.premiumInputs);
}

function isLegacyTestReport(report: InternshipSearchReport) {
  return !report.isPaid && !report.premiumInputs;
}

function isWeakSourceUrl(url?: string, source?: string) {
  const combined = `${url ?? ""} ${source ?? ""}`.toLowerCase();
  return weakSourceHosts.some((host) => combined.includes(host));
}

function isLinkedInUrl(url?: string, source?: string) {
  const combined = `${url ?? ""} ${source ?? ""}`.toLowerCase();
  return combined.includes("linkedin.com");
}

function parseDeadline(deadline?: string) {
  if (!deadline) return undefined;
  if (/not listed|unknown|unclear|not specified|n\/a/i.test(deadline)) return undefined;
  const time = new Date(deadline).getTime();
  if (Number.isNaN(time)) return undefined;
  return new Date(time);
}

function dayDiffFromToday(date: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

function offerDiagnosticText(offer: PremiumOffer) {
  return [offer.url, offer.source, offer.deadline, offer.publishedDate, offer.rawSourceSnippet, offer.risks.join(" ")].join(" ").toLowerCase();
}

function hasSavedStalePostingSignal(offer: PremiumOffer) {
  const text = offerDiagnosticText(offer);
  return /\b(2019|2020|2021|2022|2023|2024)\b/.test(text);
}

function offerQualityFlags(offer: PremiumOffer) {
  const flags: Array<{ label: string; kind?: "danger" | "warning" | "neutral" }> = [];
  const parsedDeadline = parseDeadline(offer.deadline);
  const diagnostics = offerDiagnosticText(offer);

  if (!offer.deadline || !parsedDeadline) {
    flags.push({ label: "missing deadline", kind: "neutral" });
  } else {
    const days = dayDiffFromToday(parsedDeadline);
    if (days < 0) flags.push({ label: "expired deadline", kind: "danger" });
    if (days === 0) flags.push({ label: "deadline today", kind: "danger" });
    if (days === 1) flags.push({ label: "deadline tomorrow", kind: "warning" });
  }

  if (isWeakSourceUrl(offer.url, offer.source)) flags.push({ label: "weak source", kind: "warning" });
  if (isLinkedInUrl(offer.url, offer.source)) flags.push({ label: "LinkedIn URL", kind: "danger" });
  if (/unreachable_url|not reachable|404|410/.test(diagnostics)) flags.push({ label: "unreachable_url", kind: "danger" });
  if (hasSavedStalePostingSignal(offer)) flags.push({ label: "stale_posting", kind: "danger" });
  if (/generic_redirect|generic careers|generic career|redirected to generic/.test(diagnostics)) flags.push({ label: "generic_redirect", kind: "warning" });
  if (/archived_or_closed|archived|position closed|job closed|no longer available|removed|posting has expired/.test(diagnostics)) flags.push({ label: "archived_or_closed", kind: "danger" });
  if (/content_mismatch|content mismatch|specific offer not found|title not found|company not found/.test(diagnostics)) flags.push({ label: "content_mismatch", kind: "warning" });

  return flags;
}

function reportAnomalies(report: InternshipSearchReport) {
  const status = premiumStatus(report);
  const offerCount = report.premiumOffers.length;
  const error = report.premiumSearchError ?? "";
  const anomalies: string[] = [];

  if (report.isPaid && status === "not_started") anomalies.push("paid_not_started");
  if (report.isPaid && status === "ready_to_run" && offerCount > 0) anomalies.push("paid_ready_with_existing_offers");
  if (!report.isPaid && offerCount > 0) anomalies.push("not_paid_with_offers");
  if (status === "completed" && offerCount === 0) anomalies.push("completed_with_zero_offers");
  if (status === "failed" && offerCount > 0) anomalies.push("failed_with_saved_offers");
  if (/json.*pars|parse.*json|Premium search JSON parsing failed/i.test(error)) anomalies.push("json_parse_failed");
  if (report.premiumOffers.some((offer) => offerQualityFlags(offer).some((flag) => flag.label === "expired deadline"))) anomalies.push("expired_offer_saved");

  return anomalies;
}

function matchesFilter(row: ReportRow, filter: Filter) {
  const report = row.report;
  if (filter === "active") return isActivePremiumReport(report);
  if (filter === "all") return true;
  if (filter === "paid") return Boolean(report.isPaid);
  if (filter === "legacy_test") return isLegacyTestReport(report);
  if (filter === "anomalies") return reportAnomalies(report).length > 0;
  return premiumStatus(report) === filter;
}

function rowPriority(row: ReportRow) {
  if (row.report.isPaid) return 0;
  if (row.report.premiumInputs) return 1;
  if (isLegacyTestReport(row.report)) return 3;
  return 2;
}

function sortRows(a: ReportRow, b: ReportRow) {
  return rowPriority(a) - rowPriority(b) || timestamp(b.report.updatedAt) - timestamp(a.report.updatedAt) || timestamp(b.report.createdAt) - timestamp(a.report.createdAt);
}

function retryMarker(error?: string) {
  if (!error) return "None";
  return error.includes("[retry-used]") ? "Retry used" : "No retry marker";
}

function summarizeLog(logs: AdminSearchLog[]) {
  return logs.find((log) => log.querySummary)?.querySummary ?? "No query summary found.";
}

function briefFromInputs(inputs?: PremiumSearchInputs): PremiumSearchBrief | undefined {
  if (!inputs) return undefined;
  const hardFilters = inputs.hardFilters?.length ? inputs.hardFilters : inputs.thingsToAvoid ? [inputs.thingsToAvoid] : [];
  return {
    targetRoles: inputs.targetRoles ?? [],
    rolePriority: inputs.rolePriority?.length ? inputs.rolePriority : inputs.targetRoles ?? [],
    targetIndustries: inputs.targetIndustries ?? [],
    strictCities: inputs.strictCities?.length ? inputs.strictCities : inputs.targetCities,
    acceptableCountries: inputs.acceptableCountries?.length ? inputs.acceptableCountries : inputs.targetCountries,
    remoteAccepted: Boolean(inputs.remoteAccepted),
    languages: inputs.languages?.length ? inputs.languages : inputs.languagesSpoken.map((language) => ({ language, level: "Working proficiency" })),
    internshipStartDate: inputs.internshipStartDate,
    internshipDuration: inputs.internshipDuration,
    durationStrictness: inputs.durationStrictness ?? "flexible",
    companiesAlreadyAppliedTo: inputs.companiesAlreadyAppliedTo,
    hardFilters,
    softPreferences: inputs.softPreferences ?? [],
    broadeningOrder: inputs.broadeningOrder?.length ? inputs.broadeningOrder : ["nearby cities", "adjacent roles", "nearby countries", "broader high-signal companies"],
    profileSummary: inputs.profileSummary ? "[hidden in admin dashboard]" : "",
    idealInternshipDescription: inputs.idealInternshipDescription
  };
}

function safePremiumInputs(inputs?: PremiumSearchInputs) {
  if (!inputs) return undefined;
  return { ...inputs, profileSummary: inputs.profileSummary ? "[hidden in admin dashboard]" : "" };
}

function Badge({ children, kind }: { children: string; kind?: "danger" | "warning" | "neutral" }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${warningClass(kind)}`}>{children}</span>;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-ink p-4 text-xs leading-5 text-white">{JSON.stringify(value ?? null, null, 2)}</pre>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase text-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function AccessForm({ configuredPassword }: { configuredPassword?: string }) {
  return (
    <section className="section">
      <h1 className="text-3xl font-bold text-ink">Premium search admin</h1>
      {!configuredPassword ? <p className="mt-3 max-w-md text-sm text-red-700">Set ADMIN_DASHBOARD_PASSWORD before using this dashboard in production.</p> : null}
      <form className="mt-6 flex max-w-md gap-3">
        <input className="field" name="password" type="password" placeholder="Admin dashboard password" />
        <button className="button-primary">Enter</button>
      </form>
    </section>
  );
}

export default async function AdminPremiumSearchesPage({ searchParams }: { searchParams: { password?: string; filter?: string; report?: string } }) {
  const configuredPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
  const authorized = isAuthorized(searchParams.password);

  if (!authorized) {
    return <AccessForm configuredPassword={configuredPassword} />;
  }

  const filter: Filter = filters.some((item) => item.id === searchParams.filter) ? (searchParams.filter as Filter) : "active";
  const [reports, logs] = await Promise.all([listReports(), listLogs()]);
  const premiumReports = reports.filter(isPremiumReport);
  const profiles = await Promise.all(premiumReports.map((report) => getProfile(report.profileId)));
  const rows = premiumReports
    .map((report, index) => ({
      report,
      email: profiles[index]?.email ?? "unknown",
      logs: logs.filter((log) => log.reportId === report.id)
    }))
    .sort(sortRows);
  const visibleRows = rows.filter((row) => matchesFilter(row, filter));
  const selected = rows.find((row) => row.report.id === searchParams.report) ?? visibleRows[0];
  const selectedBrief = briefFromInputs(selected?.report.premiumInputs);

  return (
    <section className="section">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-signal">Internal admin</p>
          <h1 className="mt-3 text-4xl font-bold text-ink">Premium searches</h1>
          <p className="mt-3 max-w-3xl text-ink/70">Monitor real premium search reports first, then inspect legacy/test reports or suspicious states when needed.</p>
        </div>
        <Link className="text-sm font-bold text-signal" href={`/admin?password=${encodeURIComponent(searchParams.password ?? "")}`}>Back to admin</Link>
      </div>

      {process.env.NODE_ENV === "production" && !configuredPassword ? <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">Set ADMIN_DASHBOARD_PASSWORD before using this page in production.</p> : null}

      <div className="mt-8 grid gap-4 md:grid-cols-5">
        <Metric label="Active premium" value={rows.filter((row) => isActivePremiumReport(row.report)).length} />
        <Metric label="Paid" value={rows.filter((row) => row.report.isPaid).length} />
        <Metric label="Completed" value={rows.filter((row) => premiumStatus(row.report) === "completed").length} />
        <Metric label="Failed" value={rows.filter((row) => premiumStatus(row.report) === "failed").length} />
        <Metric label="Anomalies" value={rows.filter((row) => reportAnomalies(row.report).length > 0).length} />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link key={item.id} className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${filter === item.id ? "bg-signal text-white ring-signal" : "bg-white text-ink ring-line"}`} href={dashboardHref(searchParams.password, item.id)}>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-mist text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Offers</th>
              <th className="px-4 py-3">Anomalies</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visibleRows.length ? visibleRows.map(({ report, email }) => {
              const anomalies = reportAnomalies(report);
              return (
                <tr key={report.id} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{report.id}</td>
                  <td className="px-4 py-3 text-ink/70">{email}</td>
                  <td className="px-4 py-3">{report.isPaid ? "Paid" : "Not paid"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusClass(report.premiumSearchStatus)}`}>{premiumStatus(report)}</span></td>
                  <td className="px-4 py-3">{report.premiumOffers.length}</td>
                  <td className="max-w-sm px-4 py-3">
                    {anomalies.length ? <div className="flex flex-wrap gap-1">{anomalies.map((anomaly) => <Badge key={anomaly} kind="warning">{anomaly}</Badge>)}</div> : <span className="text-ink/40">None</span>}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-ink/60">{report.premiumSearchError ? <span>{retryMarker(report.premiumSearchError)}: {report.premiumSearchError}</span> : "None"}</td>
                  <td className="px-4 py-3 text-ink/60">{formatDate(report.updatedAt)}</td>
                  <td className="px-4 py-3"><Link className="font-bold text-signal underline" href={dashboardHref(searchParams.password, filter, report.id)}>View</Link></td>
                </tr>
              );
            }) : (
              <tr><td className="px-4 py-6 text-ink/60" colSpan={9}>No premium reports match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <article className="mt-10 rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-signal">Report detail</p>
              <h2 className="mt-2 break-all text-2xl font-black text-ink">{selected.report.id}</h2>
              <p className="mt-2 text-sm text-ink/60">Created {formatDate(selected.report.createdAt)} · Updated {formatDate(selected.report.updatedAt)}</p>
              {reportAnomalies(selected.report).length ? <div className="mt-3 flex flex-wrap gap-2">{reportAnomalies(selected.report).map((anomaly) => <Badge key={anomaly} kind="warning">{anomaly}</Badge>)}</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={selected.report.id} />
              {selected.report.accessToken ? <a className="rounded-md bg-signal px-3 py-2 text-sm font-bold text-white" href={premiumReportHref(selected.report)} target="_blank" rel="noreferrer">Open premium report</a> : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Metric label="Paid status" value={selected.report.isPaid ? "Paid" : "Not paid"} />
            <Metric label="Search status" value={premiumStatus(selected.report)} />
            <Metric label="Premium offers" value={selected.report.premiumOffers.length} />
            <Metric label="Retry marker" value={retryMarker(selected.report.premiumSearchError)} />
          </div>

          {selected.report.premiumSearchError ? <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{selected.report.premiumSearchError}</p> : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section>
              <h3 className="text-lg font-bold text-ink">Premium inputs</h3>
              <div className="mt-3"><JsonBlock value={safePremiumInputs(selected.report.premiumInputs)} /></div>
            </section>
            <section>
              <h3 className="text-lg font-bold text-ink">Premium search brief</h3>
              <div className="mt-3"><JsonBlock value={selectedBrief} /></div>
            </section>
          </div>

          <section className="mt-6">
            <h3 className="text-lg font-bold text-ink">Query summary</h3>
            <p className="mt-3 rounded-md bg-mist p-4 text-sm leading-6 text-ink/70">{summarizeLog(selected.logs)}</p>
          </section>

          <section className="mt-6">
            <h3 className="text-lg font-bold text-ink">Premium offers returned</h3>
            <div className="mt-3 grid gap-4">
              {selected.report.premiumOffers.length ? selected.report.premiumOffers.map((offer) => {
                const qualityFlags = offerQualityFlags(offer);
                return (
                  <div key={offer.id} className="rounded-md border border-line bg-mist p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-black text-ink">{offer.company}</p>
                        <p className="font-bold text-ink/80">{offer.title}</p>
                        <p className="text-sm text-ink/60">{offer.location} · {offer.deadline || "Deadline not listed"}</p>
                      </div>
                      <a className="text-sm font-bold text-signal underline" href={offer.url} target="_blank" rel="noreferrer">Open source</a>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                      <p>Match: {offer.matchScore}</p>
                      <p>Quality: {offer.qualityScore}</p>
                      <p>Type: {offer.matchType ?? "not set"}</p>
                    </div>
                    {qualityFlags.length ? <div className="mt-3 flex flex-wrap gap-2"><span className="text-xs font-black uppercase text-ink/45">Admin flags</span>{qualityFlags.map((flag) => <Badge key={flag.label} kind={flag.kind}>{flag.label}</Badge>)}</div> : null}
                    {offer.risks.length ? <p className="mt-3 text-sm text-amber-800">Risks: {offer.risks.join("; ")}</p> : null}
                  </div>
                );
              }) : <p className="rounded-md bg-mist p-4 text-sm text-ink/60">No premium offers saved for this report.</p>}
            </div>
          </section>
        </article>
      ) : null}
    </section>
  );
}
