import { NextResponse } from "next/server";
import { refreshBucketOpportunities } from "@/lib/ai/cacheRefresh";
import { hasOpenAIConfig } from "@/lib/openai";
import { searchBuckets } from "@/lib/searchBuckets";
import { hasSupabaseConfig, saveCachedBucketOpportunities, saveLog } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const priorityBucketIds = [
  "consulting_strategy_europe",
  "finance_investment_switzerland",
  "marketing_brand_europe",
  "digital_growth_international",
  "sales_business_development_switzerland",
  "partnerships_sponsorship_switzerland",
  "event_operations_europe",
  "ecommerce_marketplace_europe",
  "data_analytics_europe",
  "sports_business_switzerland",
  "hospitality_travel_australia",
  "tech_events_marketing_singapore"
];

type RefreshBody = { bucketIds?: string[]; limit?: number };

function authorized(request: Request) {
  const configuredSecret = process.env.CACHE_REFRESH_SECRET;
  if (!configuredSecret) return false;
  const url = new URL(request.url);
  const providedSecret = request.headers.get("x-cache-refresh-secret") ?? url.searchParams.get("secret");
  return providedSecret === configuredSecret;
}

async function parseBody(request: Request): Promise<RefreshBody> {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as RefreshBody;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is required to store refreshed cache opportunities." }, { status: 500 });
  }

  if (!hasOpenAIConfig()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required for cache refresh." }, { status: 500 });
  }

  const body = await parseBody(request).catch(() => ({}));
  const requestedBucketIds = body.bucketIds?.length ? body.bucketIds : priorityBucketIds;
  const limit = body.limit ?? 2;
  const buckets = requestedBucketIds.map((bucketId) => searchBuckets.find((bucket) => bucket.id === bucketId)).filter((bucket): bucket is NonNullable<typeof bucket> => Boolean(bucket));
  const missingBucketIds = requestedBucketIds.filter((bucketId) => !searchBuckets.some((bucket) => bucket.id === bucketId));
  const refreshRunId = crypto.randomUUID();
  const errors: Array<{ bucketId: string; error: string }> = [];
  let savedOpportunityCount = 0;

  for (const bucket of buckets) {
    try {
      const opportunities = await refreshBucketOpportunities(bucket, refreshRunId, limit);
      const saved = await saveCachedBucketOpportunities(opportunities);
      savedOpportunityCount += saved;
      await saveLog({ id: crypto.randomUUID(), profileId: "", reportId: "", status: "completed", querySummary: `Cache refresh ${refreshRunId} saved ${saved} opportunities for ${bucket.id}.`, rawResponse: `OpenAI web_search cache refresh completed for ${bucket.id}.`, createdAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown refresh error";
      errors.push({ bucketId: bucket.id, error: message });
      await saveLog({ id: crypto.randomUUID(), profileId: "", reportId: "", status: "failed", querySummary: `Cache refresh ${refreshRunId} failed for ${bucket.id}.`, errorMessage: message, createdAt: new Date().toISOString() }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    refreshRunId,
    refreshedBucketCount: buckets.length - errors.length,
    savedOpportunityCount,
    skippedBucketCount: missingBucketIds.length + errors.length,
    missingBucketIds,
    errors
  });
}
