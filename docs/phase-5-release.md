# Phase 5 release runbook

## Schema and media order

1. Run `npx.cmd supabase db push --dry-run`. Apply `0033` with
   `npx.cmd supabase db push --yes` to the linked test project.
2. Run `npx.cmd tsx scripts/migrate-public-media.ts --dry-run`. The script
   inventories `recipe-images` without writing.
3. Run `npx.cmd tsx scripts/migrate-public-media.ts --resume`. Each object is
   copied to owner-scoped private `recipe-inputs` or public
   `recipe-catalogue`, checked by size and SHA-256, and referenced from the
   database before its public source is removed. Repeating `--resume` is safe.
4. Require `npx.cmd tsx scripts/migrate-public-media.ts --audit` to report
   `publicUserObjects: 0`. Verify the preview and private-image access before
   applying `0034`. The bucket's `public` flag must be set to false; a read
   policy change alone does not protect old public URLs.
5. Generate database types from the final linked schema with
   `npx.cmd supabase gen types typescript --linked` and review the diff.

`0034` also revokes the old browser-callable adjustment RPC after the new
server-only adjustment route is deployed. Do not apply it to a project still
serving the old route.

## Local release commands

```powershell
npm.cmd run format
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:security:integration
npm.cmd run test:security:e2e
```

Load the disposable account values into the local process for the last two
commands. The standard test command intentionally skips tests that require
them. The manual GitHub `Hosted security` job fails when its secrets are
absent; normal CI covers the credential-free commands.

## AI and URL behavior

Recipe draft generation and verification use the provider selected by
`AI_PROVIDER` with `RECIPE_VERIFICATION_ROUTING=single`. Cross-provider
verification remains optional and is not required for release. Live voice uses
OpenAI first and one Gemini fallback before a connection is established. The
typed assistant remains visible if voice ends.

Durable recipe URL imports accept public HTTP(S) hosts without a site
allowlist. `assertPublicRecipeUrl()` checks literal and DNS-resolved private
destinations, and `fetchRecipeWebSource()` checks every redirect before
fetching it. YouTube imports still require a YouTube URL.

AI telemetry contains bounded metadata only. The AI SDK does not export input
or output text. Do not put recipes, allergies, prompts, transcripts, media,
SDP, or credentials in `ai_calls` or application logs.

## Staging hold points

Run the A/B security suite and Playwright journey, test both live providers
over HTTPS, force the one-time preconnection fallback, check typed fallback and
transcript disposal, run cleanup failure-and-retry, inspect redacted telemetry,
and audit public media to zero. Run opt-in low-spend evaluations and require
zero hard food-safety violations. Configure `CRON_SECRET` on the deployed app;
store the HTTPS retention URL and same secret in Supabase Vault, then execute
`scripts/install-retention-cron.sql` to schedule the protected route hourly.
Vercel's daily invocation in `vercel.json` remains a backstop.

## Local evidence, 2026-09-24

- `0033` applied to the linked project; the security integration suite passed
  22/22 tests and Playwright passed 3/3.
- The public-media migration verified and moved five user objects; the final
  audit found zero user and zero catalogue objects in `recipe-images`.
- OpenAI recipe eval passed 4/4; assistant eval passed 3/3, including the
  unsafe raw-chicken case. That case advised discarding the chicken, consistent
  with [USDA food-safety guidance](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/steps-keep-food-safe).
- Primary Gemini recipe eval returned provider 503. The lite model completed
  one case, then became unavailable. Neither provider failure was scored as a
  food-safety result. HTTPS live-provider smoke tests and hourly Cron setup
  remain staging gates.
