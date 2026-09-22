# Skill: Pre-push verification loop

Use this before every commit/push so CI and Vercel failures are caught
locally instead of by the user.

## Why this exists

`typecheck` + `lint` + `test` are NOT sufficient. Turbopack fails the build
on things they don't check:

- Lazy `import()` specifiers that don't resolve — e.g. `recipe-scrapers`
  optional peer `parse-ingredient` compiled fine under `tsc` but broke the
  Vercel build.
- `useSearchParams()` outside a `<Suspense>` boundary (prerender error).
- Client-component rules (event handlers, hooks in server components).
- Pages that try to prerender but read cookies/Supabase (use
  `export const dynamic = "force-dynamic"`).

## Checklist

1. `npm run format` — Prettier writes, then stage its changes.
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. **`npm run build`** — required. Never skip; it is what CI/Vercel run.
6. If a migration changed: `supabase db push` (see `/supabase-migration`).
7. Commit, then `git push`.
8. Confirm CI:

   ```bash
   gh run list --limit 1          # latest run + status
   gh run watch                   # block until it finishes (optional)
   gh run view --log-failed       # inspect a failure
   ```

   Vercel deployments appear as commit checks; the GitHub Actions `CI`
   workflow runs `npm ci`, lint, typecheck, test, and build on every push
   to `main` and every PR.

## If CI/Vercel fails

- Pull the failing log with `gh run view <run-id> --log-failed`.
- Reproduce locally with the same command CI ran (`npm run build` for
  Turbopack errors).
- For "Module not found" inside `node_modules/.../*.mjs`: the package lazily
  imports an optional peer — install that peer explicitly
  (`npm install <peer>`) rather than trying to exclude the import.

## Adding dependencies

- After `npm install <pkg>`, re-run `npm run build` — bundler resolution is
  the check that matters, not install success.
- Prefer versions published >7 days ago; no floating `latest`/`*` ranges.
