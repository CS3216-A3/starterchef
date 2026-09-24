/** Create two disposable security-test accounts and write their credentials
 * to a private temp file for local verification only. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !secret || !publishable)
  throw new Error("Supabase credentials are missing");
const admin = createClient(url, secret, { auth: { persistSession: false } });

async function createAccount(label: string) {
  const email = `phase5-${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create hosted-security user ${label}`);
  return { email, password };
}

async function main() {
  const [a, b] = await Promise.all([createAccount("a"), createAccount("b")]);
  const directory = mkdtempSync(path.join(tmpdir(), "starterchef-security-"));
  const file = path.join(directory, "credentials.env");
  writeFileSync(
    file,
    [
      `SECURITY_SUPABASE_URL=${url}`,
      `SECURITY_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
      `NEXT_PUBLIC_SUPABASE_URL=${url}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
      `SECURITY_USER_A_EMAIL=${a.email}`,
      `SECURITY_USER_A_PASSWORD=${a.password}`,
      `SECURITY_USER_B_EMAIL=${b.email}`,
      `SECURITY_USER_B_PASSWORD=${b.password}`,
      "SECURITY_PHASE4_TESTS=true",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.info(`Hosted-security credentials written to ${file}`);
}

void main().catch(() => {
  console.error("Could not bootstrap hosted-security users");
  process.exitCode = 1;
});
