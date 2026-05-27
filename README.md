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

The free flow does not call OpenAI `web_search`. It uses deterministic category and region matching from the guided profile fields, selects the closest active search bucket, and returns 1 top opportunity.

If Supabase has live cached opportunities for that bucket, the app locally scores the cache against the selected market, city, track, languages, companies already applied to and things to avoid. If no cache item is available, expired, or readable, the app falls back to the existing mock weekly example.

The apply form asks users to choose up to 2 internship tracks from a fixed list. It also asks for a target market using either broad regions or specific countries. These values are stored in the existing `desired_roles` and `target_countries` arrays so the current Supabase schema stays compatible.

The CV upload is still required and stored for the later paid flow, but it is not parsed and does not influence the free result yet. The free result is based on the selected track, target market, languages and profile details.

## Protected OpenAI Cache Refresh

OpenAI is only used by the protected admin endpoint:

```bash
curl -X POST "https://your-domain.com/api/admin/refresh-cache" \
  -H "Content-Type: application/json" \
  -H "x-cache-refresh-secret: $CACHE_REFRESH_SECRET" \
  -d '{"bucketIds":["sports_business_switzerland"],"limit":2}'
```

For manual browser or cron testing, the route also accepts `?secret=...`, but the header is preferred.

The refresh endpoint:

- uses the OpenAI Responses API with `web_search`, low search context and required tool use
- searches by bucket/track/market, not by individual free user
- stores validated results in `cached_bucket_opportunities`
- saves only the best 1 or 2 opportunities per bucket
- marks opportunities as live verified with a 14-day expiry
- rejects clearly unpaid, senior, full-time, expired, LinkedIn or unusable-URL results

Recommended cadence: refresh priority buckets every 14 days. Manual refresh is enough for now; Vercel Cron can be configured later to call the protected endpoint.

## Future OpenAI Live Search

The server-side OpenAI architecture remains in the repo for the future paid flow. Live personalized search is not triggered by free users. A later premium flow can use OpenAI web search for exact roles based on CV, target cities, languages, companies already applied to and timing.

## Current Limitations

- Real persistence requires Supabase setup.
- Free usage tracking only works when Supabase env vars are configured.
- OpenAI is available only for protected admin cache refresh, not normal free submissions.
- Premium live search is not implemented yet.
- CV text extraction is basic/mock in this version.
- Cache quality depends on refresh prompts and available web results.
- LinkedIn scraping is intentionally not supported.

## Next Steps

- Add real PDF text extraction and CV storage.
- Add a real paid live search flow after premium unlock.
- Configure Vercel Cron for 14-day cache refreshes.
- Improve admin monitoring with cache refresh history and filters.
- Add tests for Supabase persistence, cache selection and weekly free usage limits.
