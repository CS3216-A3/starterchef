# Security verification

Run `docs/security-preflight.sql` against the linked **non-production** project
before applying migrations. Stop if its final query returns rows or migration
history is not exactly `0001` through `0017`.

Create two non-production users and keep credentials only in ignored local
variables (`SECURITY_USER_A_EMAIL`, `SECURITY_USER_A_PASSWORD`,
`SECURITY_USER_B_EMAIL`, `SECURITY_USER_B_PASSWORD`). Never expose the service
role through a `NEXT_PUBLIC_` variable.

Commands:

```powershell
npm.cmd run test:security:integration
npm.cmd run test:security:e2e
```

The integration suite skips when its required local credentials are absent.
