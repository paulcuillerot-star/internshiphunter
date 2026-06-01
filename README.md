# Internship Hunter

Internship Hunter helps business school students find relevant internship directions without falling into the job-board doom scroll. The free flow uses a guided form, matches a student to a broad internship search track, and shows 1 top cached opportunity example. Premium live personalized search is reserved for a future paid flow.

The product intentionally does not scrape LinkedIn and does not rely on manual offer entry as the main workflow.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase persistence
- OpenAI Responses API for protected admin cache refresh
- Stripe checkout architecture
- Vercel-ready deployment

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See `.env.example` for all supported variables. For Supabase persistence and cache refresh, configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
CACHE_REFRESH_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `CACHE_REFRESH_SECRET` are server-side only. Do not expose them in client components or browser code.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Paste and run `database/schema.sql`.
4. Copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`.
5. Copy the service role key into `SUPABASE_SERVICE_ROLE_KEY`.
6. Add the same variables locally in `.env.local` and in Vercel project settings.
7. Redeploy on Vercel.

If `cached_bucket_opportunities` already exists from an earlier version, run this manual migration too:

```sql
alter table cached_bucket_opportunities
add column if not exists review_status text not null default 'pending',
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by text;

create index if not exists cached_bucket_opportunities_review_status_idx
on cached_bucket_opportunities(review_status);
```

When Supabase is configured, Internship Hunter persists:

- submitted user profiles
- generated free search reports
- search logs
- offer feedback
- weekly free usage records
- cached bucket opportunities from protected admin refreshes

Free reports are limited to 1 per email per week through the `free_usage_limits` table. If the same email submits again in the same week, the API returns the existing report id instead of creating a new report.

When Supabase is not configured, the app keeps the current mock/in-memory fallback so the Vercel demo and local development flow remain usable.

## Current Free Flow

The free flow does not call OpenAI `web_search`. It uses deterministic category and market matching from the guided profile fields, selects the closest active search bucket, and returns 1 top opportunity.

Users choose up to 2 tracks from 8 broad business-school tracks:

- Sales, Business Development & Partnerships
- Marketing, Brand & Growth
- Strategy, Consulting & Project Management
- Finance, Investment & M&A
- Startup, Founder Associate & Operations
- Product, Tech Business & Data
- Luxury, Retail, Consumer Goods & E-commerce
- Sports, Events, Entertainment & Hospitality

Users choose 1 target market:

- Europe
- International outside Europe

The active bucket system is 8 tracks x 2 markets, for 16 total cache buckets. The selected track is the strongest matching signal, and the selected market chooses the Europe or International outside Europe bucket.

If Supabase has approved cached opportunities for that bucket, the app locally scores the approved cache against the selected market, city, track, languages, companies already applied to and things to avoid. Pending and rejected cache items are ignored. If no approved cache item is available, expired, or readable, the app falls back to the existing mock weekly example.

The CV upload is still required and stored for the later paid flow, but it is not parsed and does not influence the free result yet. The free result is based on the selected track, target market, languages and profile details.

## Protected OpenAI Cache Refresh

OpenAI is only used by the protected admin endpoint. Cache refresh is fully manual: an admin triggers it, reviews the saved opportunities in Supabase or the admin cache page, and reruns it if the results are not good enough.

The endpoint is:

```text
POST /api/admin/refresh-cache
```

It requires `x-cache-refresh-secret` to match `CACHE_REFRESH_SECRET`. For manual browser testing, the route also accepts `?secret=...`, but the header is preferred.

Refresh one bucket manually:

```bash
curl -X POST "https://your-domain.com/api/admin/refresh-cache" \
  -H "Content-Type: application/json" \
  -H "x-cache-refresh-secret: $CACHE_REFRESH_SECRET" \
  -d '{"bucketIds":["sports_events_entertainment_hospitality_europe"],"limit":1}'
```

Refresh all 16 buckets manually:

```bash
curl -X POST "https://your-domain.com/api/admin/refresh-cache" \
  -H "Content-Type: application/json" \
  -H "x-cache-refresh-secret: $CACHE_REFRESH_SECRET" \
  -d '{"limit":1}'
```

If `bucketIds` is omitted, the endpoint refreshes all 16 buckets. If `bucketIds` is provided, it refreshes only those buckets.

The refresh endpoint:

- uses the OpenAI Responses API with `web_search`, low search context and required tool use
- searches by bucket/track/market, not by individual free user
- stores validated results in `cached_bucket_opportunities`
- saves only the best 1 or 2 opportunities per bucket
- marks opportunities as live verified, pending review, and sets `expires_at` 14 days ahead as a freshness indicator
- rejects generic career pages, generic internship program pages, talent community pages, search result pages and company careers homepages
- requires a specific live posting with a specific role title, company, location or clear remote/hybrid setup, direct posting URL and evidence applications are open
- rejects clearly unpaid, senior, full-time, expired, LinkedIn or unusable-URL results
- treats missing compensation, unclear deadlines and close-but-open deadlines as visible risk notes instead of automatic rejection

No automatic Vercel Cron is configured in this PR. A good manual review cadence is every 1-2 weeks, but refresh should happen only when the admin chooses to run it.

## Admin Cache Review

Open the cache review page at:

```text
/admin/cache?password=YOUR_ADMIN_PASSWORD
```

Manual review workflow:

1. Select one or more buckets, or choose all buckets.
2. Refresh the selected buckets manually from `/admin/cache`.
3. Keep the page open while the button shows `Refreshing...`.
4. Review pending opportunities on `/admin/cache`.
5. Approve good offers.
6. Reject bad offers.
7. Free users only see approved cached offers.

Rejected offers and pending offers are ignored by the free flow. If no approved cached offer exists for a bucket, the app falls back to the existing mock weekly example.

## Future OpenAI Live Search

The server-side OpenAI architecture remains in the repo for the future paid flow. Live personalized search is not triggered by free users. A later premium flow can use OpenAI web search for exact roles based on CV, target cities, languages, companies already applied to and timing.

## Current Limitations

- Real persistence requires Supabase setup.
- Free usage tracking only works when Supabase env vars are configured.
- OpenAI is available only for protected manual admin cache refresh, not normal free submissions.
- Premium live search is not implemented yet.
- CV text extraction is basic/mock in this version.
- Cache quality depends on refresh prompts, available web results and admin approval.
- LinkedIn scraping is intentionally not supported.

## Next Steps

- Add real PDF text extraction and CV storage.
- Add a real paid live search flow after premium unlock.
- Improve admin monitoring with cache refresh history and filters.
- Add tests for Supabase persistence, cache selection and weekly free usage limits.
