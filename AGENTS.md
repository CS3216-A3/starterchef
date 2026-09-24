<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StarterChef — project rules

A personalized cooking assistant for beginners (CS3216 Assignment 3). Scan the
kitchen → get recipes that fit → cook step-by-step with a voice assistant.

## Stack & commands

- Next.js 16 (App Router) + TypeScript + Tailwind v4 · Supabase (auth, Postgres,
  storage) · Vercel AI SDK · Vitest · ESLint + Prettier.
- Windows dev machines: PowerShell blocks `npm.ps1` — use `npm.cmd` / `npx.cmd`.
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` ·
  `npm run eval` (AI evals, needs a provider key) · `npm run format`.

## Verify before commit

- **Always run `npm run build` before committing.** Turbopack catches things
  `tsc` and ESLint don't: unresolvable lazy `import()`s (e.g. optional peer
  deps), missing Suspense boundaries for `useSearchParams`, and
  client/server component violations. CI and Vercel run the same build —
  a green typecheck is not enough.
- Shell is git-bash, not cmd: use `2>/dev/null` (never `2>nul` — it creates a
  stray `nul` file) and Unix utilities.
- After `git push`, confirm CI went green:
  `gh run list --limit 1` then `gh run watch` or `gh run view --log-failed`
  for failures. Vercel deploys surface as GitHub checks on the commit.
- Run `/pre-push-checks` for the full commit/push verification loop.
- **Review before you push, and after reviewers comment.** Self-review the
  full diff against current `origin/main`, and on PRs verify each Copilot or
  human comment against the code, fix the valid ones, and reply on every
  thread. See `/code-review`.

## Conventions

- **Design tokens only.** Colors come from `@theme` in `src/app/globals.css`
  (`bg-cream`, `bg-oat`, `bg-flame`, `text-espresso`…). Never hardcode hex.
  Run `/design-system` for the full rules.
- **Mobile-first.** The cook screen is used one-handed, mid-recipe: large tap
  targets, bottom nav on mobile, voice-first interactions.
- **All LLM calls go through `src/lib/ai/`** — `getModel()` + `measuredGenerate()`.
  Never import provider SDKs (`@ai-sdk/*`) in routes or components.
- **Prompts live in `prompts/*.md`**, loaded via `renderPrompt()`. They're
  versioned because they're cited in the assignment writeup.
- **All AI output is validated** with the zod schemas in `src/lib/ai/schemas/`.
  No free-form JSON parsing.
- **AI is suggest-accept.** Show suggestions (scan results, substitutions,
  recipe edits) and let the user confirm. Never auto-apply.
- Keep this file short — detailed how-tos belong in `.devin/skills/`.
