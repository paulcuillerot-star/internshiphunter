# Internship Hunter

Internship Hunter helps students find highly relevant internship offers from the open web. The student uploads a CV and search preferences, then the app uses server-side AI research to return 2 free "golden" offers and 5 premium offers behind an unlock flow.

## Product Concept

The core value is automated internet research. The search module is designed for targeted web queries, company career pages, hidden job boards, international internship pages, and niche business, sport, event, marketing, sponsorship and tech opportunities.

The product intentionally does not scrape LinkedIn and does not rely on manual offer entry as the main workflow.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- OpenAI Responses API with built-in `web_search`
- Supabase-ready persistence layer
- Stripe-ready checkout layer
- Vercel-ready deployment

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See `.env.example` for `OPENAI_API_KEY`, `OPENAI_MODEL`, Supabase keys, Stripe keys, `NEXT_PUBLIC_SITE_URL` and `ADMIN_PASSWORD`.

## How OpenAI Web Search Is Used

The server-side module at `lib/ai/webInternshipSearch.ts` calls the OpenAI Responses API with:

```json
{ "tools": [{ "type": "web_search" }] }
```

It builds targeted queries from the candidate profile, asks the model to search like a strong internship researcher, and requests exactly 7 structured offers. API keys are read only from server-side environment variables.

If `OPENAI_API_KEY` is missing, the app returns realistic mock offers so the MVP remains runnable locally.

## Current Limitations

- Real OpenAI web search requires `OPENAI_API_KEY`.
- Real payments require Stripe keys.
- Real persistence requires Supabase setup.
- CV text extraction is basic/mock in the first version.
- Search quality depends on prompt quality and web results.
- LinkedIn scraping is intentionally not supported.

## Next Steps

- Add real PDF text extraction and CV storage.
- Persist profiles, reports, offers, feedback and payments in Supabase.
- Verify payment status server-side before showing premium offers.
- Improve admin monitoring with filters and error traces.
- Add tests for search result normalization and payment unlock logic.
