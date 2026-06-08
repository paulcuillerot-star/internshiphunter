# Internship Hunter

Internship Hunter helps business school students find relevant internship directions without falling into the job-board doom scroll. The free flow uses a guided form, matches a student to a broad internship search track, and shows 1 top cached opportunity example. The premium flow now collects search criteria before payment, then runs one paid live search after Stripe confirms the report is unlocked.

The product intentionally does not scrape LinkedIn and does not rely on manual offer entry as the main workflow.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase persistence
- OpenAI Responses API for protected admin cache refresh and paid premium search
- Stripe checkout architecture
- Sentry monitoring
- Vercel-ready deployment

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See `.env.example` for all supported variables. For Supabase persistence, cache refresh, Stripe, OpenAI and monitoring, configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
CACHE_REFRESH_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ENVIRONMENT=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CACHE_REFRESH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SENTRY_AUTH_TOKEN` are server-side only. Do not expose them in client components or browser code. `NEXT_PUBLIC_SENTRY_DSN` is safe to expose because Sentry browser events need a public DSN.

## Sentry Setup

Sentry is configured through `@sentry/nextjs` for client, server and edge runtime monitoring. The admin cache refresh page, protected refresh API, premium checkout preparation and premium live search capture safe diagnostic context.

To enable it:

1. Create a Sentry project for the Next.js app.
2. Add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` locally and in Vercel.
3. Add `SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` if you want explicit environment labels.
4. Add `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in Vercel if you want source maps uploaded during production builds.
5. Open `/admin/test-sentry?password=YOUR_ADMIN_PASSWORD` and send a test error.

The `/admin/test-sentry` route uses the same simple `ADMIN_PASSWORD` protection as the admin dashboard.

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

If `search_reports` already exists from an earlier version, run this manual migration before relying on protected report URLs and the paid premium search flow:

```sql
alter table search_reports
add column if not exists access_token text,
add column if not exists premium_inputs jsonb,
add column if not exists premium_search_status text default 'not_started',
add column if not exists premium_search_error text,
add column if not exists premium_search_started_at timestamptz,
add column if not exists premium_search_completed_at timestamptz;
```

When Supabase is configured, Internship Hunter persists:

- submitted user profiles
- generated free search reports
- premium inputs and premium search status
- search logs
- offer feedback
- weekly free usage records
- cached bucket opportunities from protected admin refreshes

Free reports are limited to 1 per email per week through the `free_usage_limits` table. If the same email submits again in the same week, the API returns the existing report id instead of creating a new report.

Report and premium URLs are protected with a private report access token. New report URLs look like `/report/{reportId}?token={accessToken}` and `/premium/{reportId}?token={accessToken}`. In production, a report cannot be opened with only its id.

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

The CV is not parsed and does not influence the free result yet. The free result is based on the selected track and broad market.

## Premium Flow

Premium starts from an existing free report. The user clicks the premium CTA and lands on `/premium/{reportId}?token={accessToken}`.

Before payment, the user fills the premium search criteria:

- target countries
- target cities
- languages spoken
- internship start date
- internship duration
- companies already applied to
- things to avoid
- profile / CV summary
- ideal internship description / dream role

The premium form does not ask for email again; the email is already linked to the original free report/profile. Submitting the form saves `premium_inputs`, sets the report to `pending_payment`, then opens Stripe Checkout. The access token is kept in success/cancel URLs but is never stored in Stripe metadata.

After Stripe payment, the user returns to `/premium/{reportId}?token={accessToken}&paid=true`. The page waits for the webhook to mark `is_paid = true`. Once the report is paid, a client runner calls `/api/premium-search` once.

The premium search route is guarded and idempotent:

- verifies the report token
- verifies the report is paid
- requires saved premium inputs
- returns existing completed offers without calling OpenAI again
- does not start a duplicate search when status is `running`
- sets status to `running` before calling OpenAI
- saves up to 3 premium offers and sets status to `completed`
- sets status to `failed` and captures Sentry context on failure

Premium live search returns up to 3 curated internship leads when available. It should prefer 2 strong compatible leads over 3 weak or language-incompatible ones. If criteria are narrow, the system may broaden softly on date, duration, city or adjacent roles, but it must clearly label each result as `exact`, `close` or `broadened` and explain what was broadened.

Language compatibility is a hard filter. The paid search must not include roles requiring languages the user does not speak just to fill the report. If a posting does not explicitly list languages, the system should infer likely requirements from posting language, country/city and company context. Unclear but likely compatible language fit should be shown as a risk note, not hidden.

Hard filters for paid live search include incompatible language, expired deadline, already-applied companies, LinkedIn URLs, generic careers pages, search result pages, weak aggregators, clearly unpaid roles if the user wants to avoid unpaid work, and roles that are not real internships.

## Protected OpenAI Cache Refresh

OpenAI cache refresh is only used by the protected admin endpoint. Cache refresh is fully manual: an admin triggers it, reviews the saved opportunities in Supabase or the admin cache page, and reruns it if the results are not good enough.

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

- uses the OpenAI Responses API with `web_search`, medium search context and required tool use
- searches by bucket/track/market, not by individual free user
- stores validated results in `cached_bucket_opportunities`
- saves only the best 1 or 2 opportunities per bucket
- marks opportunities as live verified, pending review, and sets `expires_at` 14 days ahead as a freshness indicator
- rejects generic career pages, generic internship program pages, talent community pages, search result pages and company careers homepages
- requires a specific live posting with a specific role title, company, location or clear remote/hybrid setup, direct posting URL and evidence applications are open
- rejects clearly unpaid, senior, full-time, expired, LinkedIn or unusable-URL results
- treats missing compensation, unclear deadlines and close-but-open deadlines as visible risk notes instead of automatic rejection
- reports refresh exceptions to Sentry when Sentry is configured

No automatic Vercel Cron is configured. A good manual review cadence is every 1-2 weeks, but refresh should happen only when the admin chooses to run it.

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

## Current Limitations

- Real persistence requires Supabase setup.
- Free usage tracking only works when Supabase env vars are configured.
- OpenAI is not called by normal free submissions.
- Paid premium search requires Stripe, Supabase and `OPENAI_API_KEY` to be configured.
- CV text extraction is basic/mock in this version.
- Cache quality depends on refresh prompts, available web results and admin approval.
- LinkedIn scraping is intentionally not supported.

## Next Steps

- Add real PDF text extraction and CV storage.
- Improve paid premium search review and support tooling.
- Improve admin monitoring with cache refresh history and filters.
- Add tests for Supabase persistence, cache selection and weekly free usage limits.
