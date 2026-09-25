# Security verification

Use disposable accounts on the linked test project. Keep their credentials in
the local process or a private OS temp file; do not commit them or place them
in GitHub Actions secrets. `scripts/bootstrap-security-users.ts` creates two
accounts and prints only the private credential-file path.

Run after migrations `0033_cooking_assistance_and_telemetry.sql` and
`0034_phase5_review_fixes.sql`:

```powershell
npm.cmd run test:security:integration
npm.cmd run test:security:e2e
```

To exercise AI recipe imports in the local browser with the same disposable
accounts, set `RUN_RECIPE_IMPORT_E2E=true` and run
`npx.cmd playwright test e2e/recipe-import.spec.ts`. This opt-in suite imports
and saves a text recipe and a recipe-card photo, then checks that both sources
receive the same daily-limit response when the other account has fewer than
six credits left. Text reviews reserve six daily AI credits and photo reviews
reserve seven; the limit proof skips when that account has enough credits. It
also needs `SUPABASE_SECRET_KEY` locally to remove the rejected test upload.

The integration and journey tests need `SECURITY_USER_A_EMAIL`,
`SECURITY_USER_A_PASSWORD`, `SECURITY_USER_B_EMAIL`, and
`SECURITY_USER_B_PASSWORD` in the local process. The Playwright journey uses
`SUPABASE_SECRET_KEY` from `.env.local` only to seed a disposable private
checkpoint photo. It exercises anonymous rejection, A/B pantry and image
isolation, prep snapshot stability, refresh, a two-tab version conflict,
checkpoint removal with its event retained, feedback, and profile history.

The manual `Hosted security` GitHub workflow refuses to run without its own
test credentials. Normal pull-request CI does not depend on those credentials.
Run the suite locally until a separate test project and explicit secret
provisioning are approved.

After the public-media command reports zero user objects, verify the deployed
preview against the same project. Then apply the planned
`0035_recipe_images_private.sql`.
Its precondition rejects any remaining object in `recipe-images` before making
the bucket private.
