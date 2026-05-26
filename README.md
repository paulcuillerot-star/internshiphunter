# Internship Hunter

Internship Hunter helps business school students find relevant internship directions without falling into the job-board doom scroll. The free flow matches a student to a broad internship search track and shows 2 cached weekly examples. Premium live personalized search is reserved for a future paid flow.

The product intentionally does not scrape LinkedIn and does not rely on manual offer entry as the main workflow.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase-ready persistence
- OpenAI Responses API architecture for future paid live search
- Stripe-ready checkout architecture for a future unlock flow
- Vercel-ready deployment

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See `.env.example` for all supported variables. For this Supabase persistence step, the required variables are:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Do not expose it in client components or browser code.

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

Free reports are limited to 1 per email per week through the `free_usage_limits` table. If the same email submits again in the same week, the API returns the existing report id instead of creating a new report.

When Supabase is not configured, the app keeps the current mock/in-memory fallback so the Vercel demo and local development flow remain usable.

## Current Free Flow

The free flow does not call OpenAI `web_search`. It uses deterministic category and region matching from the candidate profile, selects the closest active search bucket, and returns 2 cached weekly example offers.

The cached examples are realistic product examples, not live-verified vacancies.

## Future OpenAI Live Search

The server-side OpenAI architecture remains in the repo for the future paid flow. Live personalized search is not triggered by free users. A later premium flow can use OpenAI web search for exact roles based on CV, target cities, languages, companies already applied to and timing.

## Current Limitations

- Real persistence requires Supabase setup.
- Free usage tracking only works when Supabase env vars are configured.
- OpenAI live search is not enabled in the free flow.
- Stripe payments are not implemented yet.
- CV text extraction is basic/mock in this version.
- Search quality for the free report depends on rule-based category and bucket matching.
- LinkedIn scraping is intentionally not supported.

## Next Steps

- Add real PDF text extraction and CV storage.
- Add a real paid unlock flow with Stripe.
- Run personalized OpenAI live search only after premium unlock.
- Improve admin monitoring with filters and error traces.
- Add tests for Supabase persistence and weekly free usage limits.
