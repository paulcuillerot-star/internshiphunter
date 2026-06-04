import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { RefreshSubmitButton } from "./RefreshSubmitButton";
import { refreshBucketOpportunities } from "@/lib/ai/cacheRefresh";
import { hasOpenAIConfig } from "@/lib/openai";
import { priorityBucketIds, searchBuckets } from "@/lib/searchBuckets";
import { hasSupabaseConfig, listCachedBucketOpportunities, saveCachedBucketOpportunities, saveLog, updateCachedOpportunityReviewStatus } from "@/lib/store";
import type { CacheReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(password?: string) { const configuredPassword = process.env.ADMIN_PASSWORD; const isLocalDev = process.env.NODE_ENV !== "production"; return configuredPassword ? password === configuredPassword : isLocalDev; }
function cachePath(password?: string, message?: string) { const params = new URLSearchParams(); if (password) params.set("password", password); if (message) params.set("message", message); const query = params.toString(); return `/admin/cache${query ? `?${query}` : ""}`; }

async function refreshCacheAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!isAuthorized(password)) redirect("/admin/cache");
  if (!hasSupabaseConfig() || !hasOpenAIConfig()) redirect(cachePath(password, "Setup required before refreshing cache."));
  const refreshAll = formData.get("refreshAll") === "on";
  const selectedBucketIds = formData.getAll("bucketIds").map((value) => String(value)).filter(Boolean);
  const limit = Number(formData.get("limit") ?? 1) === 2 ? 2 : 1;
  const bucketIds = refreshAll ? priorityBucketIds : selectedBucketIds;
  if (!bucketIds.length) redirect(cachePath(password, "Select at least one bucket to refresh."));

  const refreshRunId = crypto.randomUUID();
  let savedCount = 0;
  let refreshedCount = 0;
  let errorCount = 0;

  Sentry.addBreadcrumb({
    category: "admin-cache-refresh",
    message: "Admin cache page refresh started",
    level: "info",
    data: { refreshRunId, bucketCount: bucketIds.length, limit }
  });

  for (const bucketId of bucketIds) {
    const bucket = searchBuckets.find((item) => item.id === bucketId);
    if (!bucket) { errorCount += 1; continue; }
    try {
      const opportunities = await refreshBucketOpportunities(bucket, refreshRunId, limit);
      const saved = await saveCachedBucketOpportunities(opportunities);
      savedCount += saved;
      refreshedCount += 1;
      await saveLog({ id: crypto.randomUUID(), profileId: "", reportId: "", status: "completed", querySummary: `Admin cache page refresh ${refreshRunId} saved ${saved} pending opportunities for ${bucket.id}.`, rawResponse: "Manual admin cache refresh completed.", createdAt: new Date().toISOString() });
    } catch (error) {
      errorCount += 1;
      const message = error instanceof Error ? error.message : "Unknown refresh error";
      Sentry.captureException(error, {
        tags: { feature: "admin-cache-refresh-page", bucketId: bucket.id },
        extra: { refreshRunId, limit, bucketId: bucket.id }
      });
      await saveLog({ id: crypto.randomUUID(), profileId: "", reportId: "", status: "failed", querySummary: `Admin cache page refresh ${refreshRunId} failed for ${bucket.id}.`, errorMessage: message, createdAt: new Date().toISOString() }).catch(() => undefined);
    }
  }

  revalidatePath("/admin/cache");
  const resultMessage = errorCount
    ? `Refresh completed with ${errorCount} error(s). ${refreshedCount} bucket(s) refreshed and ${savedCount} opportunities saved as pending.`
    : `Refresh completed. ${refreshedCount} bucket(s) refreshed and ${savedCount} opportunities saved as pending.`;
  redirect(cachePath(password, resultMessage));
}

async function reviewOpportunityAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!isAuthorized(password)) redirect("/admin/cache");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "pending") as CacheReviewStatus;
  if (id && ["pending", "approved", "rejected"].includes(status)) await updateCachedOpportunityReviewStatus(id, status);
  revalidatePath("/admin/cache");
  redirect(cachePath(password, `Marked ${status}.`));
}

function statusClass(status: CacheReviewStatus) { if (status === "approved") return "bg-emerald-50 text-signal ring-emerald-200"; if (status === "rejected") return "bg-red-50 text-red-700 ring-red-200"; return "bg-amber-50 text-amber-700 ring-amber-200"; }
function formatDate(value?: string) { if (!value) return "Not set"; return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
function timestamp(value?: string) { return value ? new Date(value).getTime() : 0; }
function countStatus(items: Array<{ reviewStatus: CacheReviewStatus }>, status: CacheReviewStatus) { return items.filter((item) => item.reviewStatus === status).length; }
function statusSortValue(status: CacheReviewStatus) { if (status === "pending") return 0; if (status === "approved") return 1; return 2; }

export default async function AdminCachePage({ searchParams }: { searchParams: { password?: string; message?: string } }) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const authorized = isAuthorized(searchParams.password);
  if (!authorized) {
    return <section className="section"><h1 className="text-3xl font-bold text-ink">Admin access</h1>{!configuredPassword ? <p className="mt-3 max-w-md text-sm text-ink/70">Set ADMIN_PASSWORD before using the cache review dashboard in production.</p> : null}<form className="mt-6 flex max-w-md gap-3"><input className="field" name="password" type="password" placeholder="Admin password" /><button className="button-primary">Enter</button></form></section>;
  }
  const opportunities = await listCachedBucketOpportunities();
  const bucketOrder = new Map(priorityBucketIds.map((bucketId, index) => [bucketId, index]));
  const bucketLookup = new Map(searchBuckets.map((bucket) => [bucket.id, bucket]));
  const grouped = new Map<string, typeof opportunities>();
  for (const opportunity of opportunities) {
    grouped.set(opportunity.bucketId, [...(grouped.get(opportunity.bucketId) ?? []), opportunity]);
  }
  const bucketGroups = Array.from(grouped.entries())
    .map(([bucketId, items]) => ({
      bucketId,
      bucket: bucketLookup.get(bucketId),
      items: [...items].sort((a, b) => statusSortValue(a.reviewStatus) - statusSortValue(b.reviewStatus) || timestamp(b.createdAt) - timestamp(a.createdAt))
    }))
    .sort((a, b) => (bucketOrder.get(a.bucketId) ?? 9999) - (bucketOrder.get(b.bucketId) ?? 9999) || a.bucketId.localeCompare(b.bucketId));
  const totalPending = countStatus(opportunities, "pending");
  const totalApproved = countStatus(opportunities, "approved");
  const totalRejected = countStatus(opportunities, "rejected");

  return (
    <section className="section">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase text-signal">Admin</p><h1 className="mt-3 text-4xl font-bold text-ink">Cache review</h1><p className="mt-3 max-w-3xl text-ink/70">Refresh buckets manually, review opportunities, approve only the ones you want users to see.</p></div><Link className="text-sm font-bold text-signal" href={`/admin?password=${encodeURIComponent(searchParams.password ?? "")}`}>Back to admin dashboard</Link></div>
      {process.env.NODE_ENV === "production" && !configuredPassword ? <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">Set ADMIN_PASSWORD before using this page in production.</p> : null}
      {!hasSupabaseConfig() ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Supabase is not configured. Cache review needs Supabase persistence.</p> : null}
      {!hasOpenAIConfig() ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm text-amber-800">OPENAI_API_KEY is not configured. Existing cache can still be reviewed, but refresh will not run.</p> : null}
      {searchParams.message ? <p className="mt-5 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-signal">{searchParams.message}</p> : null}
      <form action={refreshCacheAction} className="mt-8 grid gap-5 rounded-lg border border-line bg-white p-5 shadow-soft">
        <input type="hidden" name="password" value={searchParams.password ?? ""} />
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><p className="label">Buckets</p><p className="mt-1 text-sm text-ink/60">Select one or more buckets to refresh manually. New opportunities are saved as pending.</p></div>
          <label className="grid gap-2 md:w-32"><span className="label">Limit</span><select className="field" name="limit" defaultValue="1"><option value="1">1</option><option value="2">2</option></select></label>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-line bg-emerald-50 px-3 py-2 text-sm font-semibold text-ink/70"><input name="refreshAll" type="checkbox" />Refresh all buckets</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {priorityBucketIds.map((bucketId) => {
            const bucket = searchBuckets.find((item) => item.id === bucketId);
            return <label key={bucketId} className="flex min-h-16 items-start gap-2 rounded-md border border-line bg-white p-3 text-sm text-ink/70"><input className="mt-1" name="bucketIds" type="checkbox" value={bucketId} /><span><span className="block font-bold text-ink">{bucket?.displayTitle ?? bucketId}</span><span className="mt-1 block text-xs text-ink/50">{bucketId}</span></span></label>;
          })}
        </div>
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-signal" aria-live="polite">Refresh can take a little while. Keep this page open until the result message appears.</div>
        <RefreshSubmitButton />
      </form>
      <div className="mt-8 rounded-lg border border-line bg-white p-5 shadow-soft">
        <p className="text-sm font-bold uppercase text-ink/50">Cached opportunities summary</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><p className="text-3xl font-black text-ink">{opportunities.length}</p><p className="text-xs font-bold uppercase text-ink/45">Total</p></div>
          <div><p className="text-3xl font-black text-amber-700">{totalPending}</p><p className="text-xs font-bold uppercase text-ink/45">Pending</p></div>
          <div><p className="text-3xl font-black text-signal">{totalApproved}</p><p className="text-xs font-bold uppercase text-ink/45">Approved</p></div>
          <div><p className="text-3xl font-black text-red-700">{totalRejected}</p><p className="text-xs font-bold uppercase text-ink/45">Rejected</p></div>
        </div>
      </div>
      <div className="mt-8 grid gap-8">
        {bucketGroups.length ? bucketGroups.map(({ bucketId, bucket, items }) => {
          const pending = countStatus(items, "pending");
          const approved = countStatus(items, "approved");
          const rejected = countStatus(items, "rejected");
          return (
            <section key={bucketId} className="grid gap-4">
              <div className="rounded-lg border border-line bg-mist p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-ink">{bucket?.displayTitle ?? bucketId}</h2>
                    <p className="mt-1 text-sm font-semibold text-ink/60">{bucket ? `${bucket.category.name} · ${bucket.region}` : "Unknown bucket"}</p>
                    <p className="mt-2 text-xs font-semibold uppercase text-ink/40">{bucketId}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold uppercase text-ink/50 sm:min-w-96">
                    <div className="rounded-md bg-white p-2"><p className="text-lg font-black text-ink">{items.length}</p><p>Total</p></div>
                    <div className="rounded-md bg-white p-2"><p className="text-lg font-black text-amber-700">{pending}</p><p>Pending</p></div>
                    <div className="rounded-md bg-white p-2"><p className="text-lg font-black text-signal">{approved}</p><p>Approved</p></div>
                    <div className="rounded-md bg-white p-2"><p className="text-lg font-black text-red-700">{rejected}</p><p>Rejected</p></div>
                  </div>
                </div>
              </div>
              <div className="grid gap-5">
                {items.map((offer) => (
                  <article key={offer.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${statusClass(offer.reviewStatus)}`}>{offer.reviewStatus}</span><p className="mt-3 text-xs font-semibold uppercase text-ink/40">{offer.bucketId}</p><h2 className="mt-1 text-2xl font-bold text-ink">{offer.title}</h2><p className="mt-1 font-semibold text-signal">{offer.company}</p><p className="text-sm text-ink/60">{offer.location}</p></div><div className="flex flex-wrap gap-2"><form action={reviewOpportunityAction}><input type="hidden" name="password" value={searchParams.password ?? ""} /><input type="hidden" name="id" value={offer.id} /><input type="hidden" name="status" value="approved" /><button className="rounded-md bg-signal px-4 py-2 text-sm font-bold text-white" type="submit">Approve</button></form><form action={reviewOpportunityAction}><input type="hidden" name="password" value={searchParams.password ?? ""} /><input type="hidden" name="id" value={offer.id} /><input type="hidden" name="status" value="rejected" /><button className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700" type="submit">Reject</button></form></div></div>
                    <div className="mt-5 grid gap-4 text-sm md:grid-cols-3"><p><span className="font-bold text-ink">Match:</span> {offer.matchScore}</p><p><span className="font-bold text-ink">Quality:</span> {offer.qualityScore}</p><p><span className="font-bold text-ink">Compensation:</span> {offer.compensation || "Not specified"}</p><p><span className="font-bold text-ink">Deadline:</span> {offer.deadline || "Not specified"}</p><p><span className="font-bold text-ink">Verified:</span> {formatDate(offer.verifiedAt)}</p><p><span className="font-bold text-ink">Expires:</span> {formatDate(offer.expiresAt)}</p><p><span className="font-bold text-ink">Created:</span> {formatDate(offer.createdAt)}</p><p><span className="font-bold text-ink">Reviewed:</span> {formatDate(offer.reviewedAt)}</p><p><a className="font-bold text-signal underline" href={offer.url} target="_blank" rel="noreferrer">Open job page</a></p></div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-md bg-emerald-50 p-4"><p className="text-sm font-bold text-signal">Why it matches</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/70">{offer.whyItMatches.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rounded-md bg-amber-50 p-4"><p className="text-sm font-bold text-amber-800">Risks</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/70">{offer.risks.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
                  </article>
                ))}
              </div>
            </section>
          );
        }) : <p className="rounded-lg border border-line bg-white p-5 text-sm text-ink/70 shadow-soft">No cached opportunities yet.</p>}
      </div>
    </section>
  );
}
