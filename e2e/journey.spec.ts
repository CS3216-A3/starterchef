import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const emailA = process.env.SECURITY_USER_A_EMAIL;
const passwordA = process.env.SECURITY_USER_A_PASSWORD;
const emailB = process.env.SECURITY_USER_B_EMAIL;
const passwordB = process.env.SECURITY_USER_B_PASSWORD;
test.skip(
  !url || !key || !emailA || !passwordA || !emailB || !passwordB,
  "Local test accounts required",
);

function userClient() {
  return createClient(url!, key!, { auth: { persistSession: false } });
}

async function signIn(
  client: ReturnType<typeof userClient>,
  email: string,
  password: string,
) {
  const result = await client.auth.signInWithPassword({ email, password });
  expect(result.error).toBeNull();
  return result.data.user!.id;
}

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=",
    "base64",
  ),
);

test("two users cannot cross pantry or private image boundaries", async () => {
  const a = userClient();
  const b = userClient();
  const [owner] = await Promise.all([
    signIn(a, emailA!, passwordA!),
    signIn(b, emailB!, passwordB!),
  ]);
  const marker = `playwright-${randomUUID()}`;
  const path = `${owner}/${randomUUID()}.png`;
  let itemId: string | undefined;
  try {
    expect(
      (
        await a.rpc("merge_kitchen_items", {
          p_items: [{ kind: "ingredient", name: marker }],
        })
      ).error,
    ).toBeNull();
    const item = await a
      .from("kitchen_items")
      .select("id")
      .eq("name", marker)
      .single();
    expect(item.error).toBeNull();
    itemId = item.data!.id;
    expect(
      (await b.from("kitchen_items").select("id").eq("id", itemId)).data,
    ).toEqual([]);
    expect(
      (
        await a.storage
          .from("kitchen-images")
          .upload(path, png, { contentType: "image/png" })
      ).error,
    ).toBeNull();
    expect(
      (await b.storage.from("kitchen-images").download(path)).error,
    ).not.toBeNull();
    expect(
      (await b.storage.from("kitchen-images").createSignedUrl(path, 60)).error,
    ).not.toBeNull();
  } finally {
    if (itemId) await a.from("kitchen_items").delete().eq("id", itemId);
    await a.storage.from("kitchen-images").remove([path]);
  }
});

test("cooking keeps its prep snapshot through refresh, conflict, checkpoint removal, and feedback", async ({
  page,
  context,
}) => {
  const a = userClient();
  const owner = await signIn(a, emailA!, passwordA!);
  const marker = randomUUID();
  const title = `Playwright soup ${marker.slice(0, 8)}`;
  const ingredient = `Original ingredient ${marker.slice(0, 8)}`;
  const seeded = await a
    .from("recipes")
    .insert({
      user_id: owner,
      slug: `playwright-${marker}`,
      title,
      minutes: 10,
      servings: 1,
      ingredients: [ingredient],
      equipment: ["saucepan"],
      steps: [
        { index: 1, title: "Prepare", instruction: "Wash the ingredient." },
        { index: 2, title: "Simmer", instruction: "Simmer safely." },
      ],
    })
    .select("id")
    .single();
  expect(seeded.error).toBeNull();
  const recipeId = seeded.data!.id;
  const started = await a.rpc("start_cooking_session", {
    p_recipe_id: recipeId,
  });
  expect(started.error).toBeNull();
  const sessionId = (started.data as { id: string }).id;
  const path = `${owner}/checkpoints/${sessionId}/${randomUUID()}.png`;
  const adminKey = process.env.SUPABASE_SECRET_KEY;
  const admin = adminKey
    ? createClient(url!, adminKey, { auth: { persistSession: false } })
    : null;
  try {
    expect(
      admin,
      "Checkpoint proof needs a Supabase service key",
    ).not.toBeNull();
    expect(
      (
        await a
          .from("recipes")
          .update({ ingredients: ["Changed after start"] })
          .eq("id", recipeId)
      ).error,
    ).toBeNull();
    await page.goto(`/login?next=/cook/${sessionId}`);
    await page.getByLabel("Email").fill(emailA!);
    await page.getByLabel("Password").fill(passwordA!);
    await page.locator('button[type="submit"]').click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toBe(`/cook/${sessionId}`);
    await page.goto(`/cook/${sessionId}?prep`);
    await expect(page.getByText(ingredient)).toBeVisible();
    await expect(page.getByText("Changed after start")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(ingredient)).toBeVisible();
    await page.getByRole("link", { name: /Start cooking/ }).click();
    await expect(
      page.getByRole("heading", { name: "Step 1 of 2" }),
    ).toBeVisible();

    const other = await context.newPage();
    await other.goto(`/cook/${sessionId}`);
    const progressResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/cooking-sessions/${sessionId}/progress`),
    );
    await page.getByRole("button", { name: /Done, next step/ }).click();
    const progress = await progressResponse;
    expect(progress.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Step 2 of 2" }),
    ).toBeVisible();
    await other.getByRole("button", { name: /Done, next step/ }).click();
    await expect(other.getByText(/changed in another tab/)).toBeVisible();
    await other.close();

    if (admin) {
      expect(
        (
          await admin.storage
            .from("recipe-inputs")
            .upload(path, png, { contentType: "image/png" })
        ).error,
      ).toBeNull();
      const recorded = await a.rpc("record_cooking_checkpoint", {
        p_session_id: sessionId,
        p_step_index: 2,
        p_object_path: path,
        p_verdict: { looksRight: true, feedback: "Looks good" },
      });
      expect(recorded.error).toBeNull();
      await page.reload();
      const removalResponse = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/cooking-sessions/${sessionId}/checkpoints`) &&
          response.request().method() === "DELETE",
      );
      await page
        .getByRole("button", { name: /Remove this photo from the step/ })
        .click();
      expect((await removalResponse).status()).toBe(200);
      await expect(
        page.getByRole("button", { name: /Remove this photo from the step/ }),
      ).toHaveCount(0, { timeout: 15_000 });
      expect(
        (
          await a
            .from("session_events")
            .select("id")
            .eq("session_id", sessionId)
            .eq("kind", "photo_check")
        ).data,
      ).toHaveLength(1);
    }

    await page.getByRole("button", { name: /Finish cooking/ }).click();
    await expect(
      page.getByRole("heading", { name: "How did it go?" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Notes" })
      .fill("Playwright feedback");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
    await page.goto("/settings");
    await expect(page.getByText(title)).toBeVisible();
  } finally {
    await a.from("recipes").delete().eq("id", recipeId);
    if (admin) await admin.storage.from("recipe-inputs").remove([path]);
  }
});
