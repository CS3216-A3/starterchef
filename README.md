# StarterChef

**Your start to great cooking.** A personalized cooking assistant for
beginners: scan your kitchen to detect ingredients and equipment, get recipe
suggestions ranked by what you already have, import recipes from a link,
photo, text, or YouTube, and cook step-by-step with an AI sous-chef you can
talk to and show your pan to.

- **Live app:** [_Click here_](https://starterchef.vercel.app/)
- **Course:** CS3216 Assignment 3 (Artificial Intelligence Application)

## Team

| Name                  | Matric no. | Contributions                                                                                                                                                                                                                                          |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Huang Kaijuan Joulene | A0299817E  | Created the base app with core features and tech stack with supabase auth and posthog set up. Designed app logo and interactive feature introduction on the landing page and onboarding and profile page. Chose the AI models to use, wiring them in with Vercel AI SDK and writing initial prompts. Added per user AI rate limiting. Seeded base 6 recipes with TheMealDB. Added recipe import and core step by step cooking UX including the show camera and animated mascot. Added session memory to cooking sessions. |
| Cedric Tay | A0307676U  | Implemented AI-specific scan review UX and human-in-the-loop controls. Developed the usage-based credit and pricing model, enhanced landing-page pricing, SEO and accessibility, fixed analytics tracking, and prepared Product Hunt launch materials. |

| Angel | A |  |

| Hai Hoang | A  | |

## Tech stack

- **Next.js 16** (App Router, TypeScript) — responsive web app / PWA
- **Tailwind CSS v4** — brand tokens in `src/app/globals.css`
- **Vercel AI SDK** — provider-agnostic LLM layer (`src/lib/ai/`), swappable
  via `AI_PROVIDER` env var
- **Recipe verification routing** — uses the selected provider end-to-end by
  default; set `RECIPE_VERIFICATION_ROUTING=cross-provider` to opt into the
  OpenAI/Gemini independent-verifier workflow (requires both keys)
- **Supabase** — auth, Postgres, storage (`supabase/migrations/`)
- **Live voice** — OpenAI Realtime first, with one pre-connection Gemini Live fallback
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
4. Run the migrations in `supabase/migrations/` in order. On an existing project, check the rollout docs in `docs/` first — some phases need a preflight.
5. Load the starter recipe catalogue: run `supabase/seed/recipes.sql` in the SQL editor. The 6 recipes are sourced from [TheMealDB](https://www.themealdb.com/) for demo use; review and attribute them correctly before any public release.
6. In **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000/today`
   - Redirect URLs: `http://localhost:3000/auth/callback` and your production URL once deployed
7. Enable an auth provider (e.g. Google under **Authentication → Providers**) or keep email auth enabled.
8. (Optional) Disable **Confirm email** for password signups under **Authentication → Providers → Email** while developing — re-enable for production.

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
src/app/(marketing)/   landing page (SEO + OG, interactive demos, pricing)
src/app/(app)/         authed app shell: today, kitchen, recipes, cook/[id], sessions, settings
src/lib/data.ts        server-side query helpers (profiles, kitchen_items, recipes, sessions)
src/lib/types.ts       DB row types (hand-maintained)
src/lib/credits.ts     plan + credit amounts — single source for pricing UI
supabase/seed/         starter recipe catalogue (TheMealDB demo data)
src/app/api/ai/        AI endpoints (kitchen-scan, suggestions, trusted assistant, realtime credentials)
src/hooks/             voice hooks: OpenAI Realtime + Gemini Live
src/lib/ai/            provider abstraction, zod schemas, tools, voice telemetry
src/lib/posthog/       analytics init + event tracking helper
src/instrumentation.ts PostHog AI observability via OpenTelemetry
src/lib/supabase/      browser + server clients
workflows/             durable workflows (recipe verification, session recap)
e2e/                   Playwright end-to-end specs
prompts/               versioned system prompts (cited in milestones writeup)
evals/                 eval datasets + runner (LLMOps milestone)
supabase/migrations/   database schema (RLS on every user table)
.devin/skills/         agent skills for project workflows
docs/specs/            feature specs
```

## Resources used

- [Vercel AI SDK](https://ai-sdk.dev/) — provider abstraction, structured
  outputs, tool calling
- [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side) —
  auth client patterns
- CS3216 Assignment 3 spec — milestone requirements
- _add tutorials, design references, and libraries as you use them_
