import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(password?: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const isLocalDev = process.env.NODE_ENV !== "production";
  return configuredPassword ? password === configuredPassword : isLocalDev;
}

export default async function AdminTestSentryPage({ searchParams }: { searchParams: { password?: string; trigger?: string } }) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const authorized = isAuthorized(searchParams.password);
  const sentryConfigured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  let eventId: string | undefined;

  if (!authorized) {
    return (
      <section className="section">
        <h1 className="text-3xl font-bold text-ink">Admin access</h1>
        {!configuredPassword ? <p className="mt-3 max-w-md text-sm text-ink/70">Set ADMIN_PASSWORD before using the Sentry test page in production.</p> : null}
        <form className="mt-6 flex max-w-md gap-3">
          <input className="field" name="password" type="password" placeholder="Admin password" />
          <button className="button-primary">Enter</button>
        </form>
      </section>
    );
  }

  if (searchParams.trigger === "1") {
    eventId = Sentry.captureException(new Error("Sentry admin test event from Internship Hunter"), {
      tags: { feature: "admin-test-sentry" }
    });
    await Sentry.flush(2000);
  }

  return (
    <section className="section">
      <p className="text-sm font-semibold uppercase text-signal">Admin</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">Test Sentry</h1>
      <p className="mt-3 max-w-2xl text-ink/70">Use this protected page to send one test error to Sentry and confirm production monitoring is wired correctly.</p>

      {!sentryConfigured ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Sentry DSN is not configured yet. Add SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN before expecting events to appear.</p> : null}
      {eventId ? <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-signal">Test event sent to Sentry. Event id: {eventId}</p> : null}

      <form className="mt-8 rounded-lg border border-line bg-white p-5 shadow-soft">
        <input type="hidden" name="password" value={searchParams.password ?? ""} />
        <input type="hidden" name="trigger" value="1" />
        <button className="button-primary" type="submit">Send test error</button>
      </form>

      <Link className="mt-6 inline-flex text-sm font-bold text-signal" href={`/admin?password=${encodeURIComponent(searchParams.password ?? "")}`}>Back to admin dashboard</Link>
    </section>
  );
}
