# StarterChef

**Your kitchen, your next meal.** A personalized cooking assistant for
beginners: scan your kitchen to detect ingredients and equipment, get recipe
suggestions ranked by what you already have, and cook step-by-step with a
voice-enabled AI sous-chef.

- **Live app:** _TBD — add deployed URL here_
- **Course:** CS3216 Assignment 3 (Artificial Intelligence Application)

## Team

| Name  | Matric no. | Contributions |
| ----- | ---------- | ------------- |
| _TBD_ | _TBD_      | _TBD_         |

## Tech stack

- **Next.js 16** (App Router, TypeScript) — responsive web app / PWA
- **Tailwind CSS v4** — brand tokens in `src/app/globals.css`
- **Vercel AI SDK** — provider-agnostic LLM layer (`src/lib/ai/`), swappable
  via `AI_PROVIDER` env var
- **Supabase** — auth, Postgres, storage (`supabase/migrations/`)
- **Vitest** + **ESLint/Prettier** + **Husky/lint-staged** + **GitHub Actions**

## Local setup

```bash
cp .env.example .env.local   # fill in an AI provider key and Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

### Supabase checklist

1. Create a project at supabase.com.
2. In **Project Settings → API Keys**, copy the **publishable** key (starts with `sb_publishable_`) into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **secret** key (starts with `sb_secret_`) into `SUPABASE_SECRET_KEY`.
3. In **Project Settings → Data API**, enable the Data API and disable **Automatically expose new tables**.
4. Run the migrations in `supabase/migrations/` (0001, 0002, 0003) in order in the Supabase SQL editor.
5. In **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000/today`
   - Redirect URLs: `http://localhost:3000/auth/callback` and your production URL once deployed
6. Enable an auth provider (e.g. Google under **Authentication → Providers**) or keep email auth enabled.
7. (Optional) Disable **Confirm email** for password signups under **Authentication → Providers → Email** while developing — re-enable for production.

Useful scripts:

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # Vitest unit tests
npm run eval          # AI eval suite (needs a provider API key)
npm run format        # Prettier
```

## Repo layout

```
src/app/(marketing)/   landing page (SEO + OG, hero/features/pricing)
src/app/(app)/         authed app shell: today, kitchen, recipes, cook/[id]
src/app/api/ai/        AI endpoints (kitchen-scan, suggest-recipes, assistant, realtime session)
src/hooks/             voice hooks: web-speech, OpenAI Realtime, Gemini Live
src/lib/ai/            provider abstraction, zod schemas, tools, voice telemetry
src/lib/posthog/       analytics init + event tracking helper
src/instrumentation.ts PostHog AI observability via OpenTelemetry
src/lib/supabase/      browser + server clients
prompts/               versioned system prompts (cited in milestones writeup)
evals/                 eval datasets + runner (LLMOps milestone)
supabase/migrations/   database schema (RLS on every user table)
.devin/skills/         agent skills: design-system, new-component, run-evals, db-migration
docs/specs/            feature specs
```

## Resources used

- [Vercel AI SDK](https://ai-sdk.dev/) — provider abstraction, structured
  outputs, tool calling
- [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side) —
  auth client patterns
- CS3216 Assignment 3 spec — milestone requirements
- _add tutorials, design references, and libraries as you use them_
