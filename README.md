# Round Robin Quiz Duel

Phone-first multiplayer quiz game built for:

- Next.js App Router
- Vercel deployment
- Supabase persistence

## Stack

- frontend: Next.js + React + TypeScript
- styling: plain CSS
- backend: Next route handlers
- persistence: Supabase Postgres
- updates: polling-based room sync
- trivia: OpenTDB with local fallback questions

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Run the SQL in [schema.sql](/C:/Users/Nico/Documents/code/quiz-duel-pwa/supabase/schema.sql) in your Supabase project

## Local dev

```bash
npm install
npm run dev
```

## Vercel deploy

```bash
npm i -g vercel
vercel
```

Then add the same three environment variables in the Vercel project settings.

## Notes

- this version is designed to fit Vercel better than the old always-on websocket server
- room state is stored in Supabase instead of server memory
- live updates use frequent polling, which is simpler and more deployment-friendly
