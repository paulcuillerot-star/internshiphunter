import Link from "next/link";
import { listFeedback, listLogs, listReports, getProfile } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage({ searchParams }: { searchParams: { password?: string } }) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const isLocalDev = process.env.NODE_ENV !== "production";
  const authorized = configuredPassword ? searchParams.password === configuredPassword : isLocalDev;

  if (!authorized) {
    return (
      <section className="section">
        <h1 className="text-3xl font-bold text-ink">Admin access</h1>
        {!configuredPassword ? (
          <p className="mt-3 max-w-md text-sm text-ink/70">Set ADMIN_PASSWORD before using the admin dashboard in production.</p>
        ) : null}
        <form className="mt-6 flex max-w-md gap-3">
          <input className="field" name="password" type="password" placeholder="Admin password" />
          <button className="button-primary">Enter</button>
        </form>
      </section>
    );
  }

  const [reports, feedback, logs] = await Promise.all([listReports(), listFeedback(), listLogs()]);
  const reportProfiles = await Promise.all(reports.map((report) => getProfile(report.profileId)));

  return (
    <section className="section">
      <p className="text-sm font-semibold uppercase text-signal">Monitoring</p>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-ink">Admin dashboard</h1>
          <p className="mt-3 text-ink/70">For viewing searches, generated offers, feedback, payments and errors. No manual offer entry.</p>
        </div>
        <Link className="rounded-md bg-signal px-4 py-2 text-sm font-bold text-white" href={`/admin/cache?password=${encodeURIComponent(searchParams.password ?? "")}`}>Review cache</Link>
      </div>

      <div className="mt-8 grid gap-5">
        {reports.map((report, index) => {
          const profile = reportProfiles[index];
          return (
            <article key={report.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-ink">{profile.firstName || "Candidate"} - {profile.email}</h2>
                  <p className="mt-1 text-sm text-ink/60">{profile.desiredRoles.join(", ")} in {profile.targetCountries.join(", ")}</p>
                </div>
                <div className="text-sm text-ink/70">
                  <p>Status: {report.status}</p>
                  <p>Payment: {report.isPaid ? "paid" : "not paid"}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[...report.freeOffers, ...report.premiumOffers].map((offer) => (
                  <div key={offer.id} className="rounded-md bg-mist p-3 text-sm">
                    <p className="font-semibold text-ink">{offer.company} - {offer.title}</p>
                    <p className="text-ink/60">Match {offer.matchScore}, quality {offer.qualityScore}</p>
                  </div>
                ))}
              </div>
              {report.errorMessage ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{report.errorMessage}</p> : null}
            </article>
          );
        })}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-ink">Feedback</h2>
          <div className="mt-4 space-y-3 text-sm text-ink/70">
            {feedback.length ? feedback.map((item) => <p key={item.id}>{item.offerId}: {item.feedbackType}</p>) : <p>No feedback yet.</p>}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-ink">Search logs</h2>
          <div className="mt-4 space-y-3 text-sm text-ink/70">
            {logs.length ? logs.map((log) => <p key={log.id}>{log.status}: {log.querySummary}</p>) : <p>No logs yet.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
