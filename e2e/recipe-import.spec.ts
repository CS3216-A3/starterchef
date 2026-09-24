import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

loadEnvConfig(process.cwd());
const email = process.env.SECURITY_USER_B_EMAIL;
const password = process.env.SECURITY_USER_B_PASSWORD;
const enabled = process.env.RUN_RECIPE_IMPORT_E2E === "true";
test.skip(
  !enabled || !email || !password,
  "Opt-in import test requires local test credentials",
);
test.setTimeout(360_000);

const recipeText = `Test kitchen tomato pasta
Serves 2. Total time 30 minutes.
Ingredients: 200 g dry pasta, 400 g canned tomatoes, 1 tbsp olive oil, 1 garlic clove, 2 litres water, salt.
Equipment: saucepan, frying pan, colander.
1. Bring 2 litres water to a boil in a saucepan. Cook pasta according to the package until tender. Reserve 60 ml pasta water, then drain.
2. While pasta cooks, heat oil in a frying pan over medium heat. Add minced garlic and cook for 30 seconds.
3. Add canned tomatoes and simmer for 10 minutes. Season with salt.
4. Toss the cooked pasta with tomato sauce, adding the reserved pasta water only if the sauce is too thick. Serve hot.`;

async function status(page: import("@playwright/test").Page, draftId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/recipe-drafts/${id}`, {
      cache: "no-store",
    });
    return { http: response.status, body: await response.json() };
  }, draftId);
}

async function waitForReview(
  page: import("@playwright/test").Page,
  draftId: string,
) {
  await expect
    .poll(
      async () => {
        const current = await status(page, draftId);
        if (current.http !== 200)
          throw new Error(`Draft status HTTP ${current.http}`);
        if (
          ["blocked", "failed_retryable", "failed_permanent"].includes(
            current.body.status,
          )
        ) {
          throw new Error(
            `Review ended ${current.body.status}: ${current.body.failureCode}`,
          );
        }
        return current.body.status;
      },
      { timeout: 300_000, intervals: [2000, 3000, 5000] },
    )
    .toBe("awaiting_user_acceptance");
}

async function recipeCardImage(
  context: import("@playwright/test").BrowserContext,
) {
  const card = await context.newPage();
  await card.setViewportSize({ width: 900, height: 1150 });
  await card.setContent(
    `<main style="font: 24px/1.45 Arial; color: black; background: white; padding: 45px; width: 800px; box-sizing: border-box; white-space: pre-wrap">${recipeText}</main>`,
  );
  const image = await card.screenshot({ type: "png" });
  await card.close();
  return image;
}

async function signInAndOpenImport(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login?next=/recipes/import");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((cookie) =>
          cookie.name.includes("auth-token"),
        ),
      { timeout: 45_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => (await fetch("/api/recipe-drafts")).status),
      { timeout: 45_000 },
    )
    .toBe(200);
  // Wait for the server to recognize auth before opening a protected page.
  await page.goto("/recipes/import");
  await expect(page).toHaveURL(/\/recipes\/import(?:\?|$)/);
}

test("text import reaches verified review and saves a recipe", async ({
  page,
}) => {
  await signInAndOpenImport(page, email!, password!);

  await page
    .getByPlaceholder("Paste the full recipe text here...")
    .fill(recipeText);
  const queuedPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/recipe-drafts") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Build recipe" }).click();
  const queued = await queuedPromise;
  expect(queued.status(), await queued.text()).toBe(202);
  const { draftId } = (await queued.json()) as { draftId: string };
  await waitForReview(page, draftId);
  await expect(page.getByText("Your verified recipe is ready")).toBeVisible();
  await page.getByRole("button", { name: "Accept recipe" }).click();
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
    .toMatch(/^\/recipes\/[0-9a-f-]{36}$/);
  const saved = await status(page, draftId);
  expect(saved.body.status).toBe("accepted");
  expect(saved.body.acceptedRecipeId).toBeTruthy();
});

test("recipe-card photo reaches verified review and saves a recipe", async ({
  page,
  context,
}) => {
  await signInAndOpenImport(page, email!, password!);

  const cardImage = await recipeCardImage(context);
  await page.getByRole("button", { name: "Photo" }).click();
  await page.getByLabel("Dish name (optional)").fill("Tomato pasta");
  const uploadPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/recipe-inputs") &&
      response.request().method() === "POST",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "recipe-card.png",
    mimeType: "image/png",
    buffer: cardImage,
  });
  const upload = await uploadPromise;
  expect(upload.status(), await upload.text()).toBe(201);
  await expect(
    page.getByText("Photo uploaded. You can now build a recipe."),
  ).toBeVisible();
  const queuedPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/recipe-drafts") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Build recipe" }).click();
  const queued = await queuedPromise;
  expect(queued.status(), await queued.text()).toBe(202);
  const { draftId } = (await queued.json()) as { draftId: string };
  try {
    await waitForReview(page, draftId);
    await expect(page.getByText("Your verified recipe is ready")).toBeVisible();
    await page.getByRole("button", { name: "Accept recipe" }).click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .toMatch(/^\/recipes\/[0-9a-f-]{36}$/);
    const saved = await status(page, draftId);
    expect(saved.body.status).toBe("accepted");
    expect(saved.body.acceptedRecipeId).toBeTruthy();
  } finally {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const signed = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    if (!signed.error) {
      const draft = await client
        .from("recipe_drafts")
        .select("status")
        .eq("id", draftId)
        .single();
      if (draft.data?.status !== "accepted")
        await client.rpc("reject_recipe_draft", { p_draft_id: draftId });
    }
  }
});

test("text and photo reviews enforce their respective daily credit costs", async ({
  page,
  context,
}) => {
  const ownerEmail = process.env.SECURITY_USER_A_EMAIL;
  const ownerPassword = process.env.SECURITY_USER_A_PASSWORD;
  test.skip(
    !ownerEmail || !ownerPassword || !process.env.SUPABASE_SECRET_KEY,
    "Second local test account and service key required",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const client = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const signed = await client.auth.signInWithPassword({
    email: ownerEmail!,
    password: ownerPassword!,
  });
  expect(signed.error).toBeNull();
  const userId = signed.data.user!.id;
  const before = await client
    .from("ai_usage_quota")
    .select("date,count")
    .eq("user_id", userId)
    .maybeSingle();
  expect(before.error).toBeNull();
  const used =
    before.data?.date === new Date().toISOString().slice(0, 10)
      ? before.data.count
      : 0;
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 50);
  test.skip(
    used + 6 <= limit,
    "This proof requires fewer than six credits left",
  );

  await signInAndOpenImport(page, ownerEmail!, ownerPassword!);

  await page
    .getByPlaceholder("Paste the full recipe text here...")
    .fill(recipeText);
  let responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/recipe-drafts") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Build recipe" }).click();
  const textResponse = await responsePromise;
  expect(textResponse.status()).toBe(429);
  const textError = await textResponse.json();
  expect(textError.error.details).toMatchObject({ required: 6 });
  expect(textResponse.headers()["retry-after"]).toBeTruthy();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "A recipe review needs 6 daily AI credits",
  );

  const cardImage = await recipeCardImage(context);
  await page.getByRole("button", { name: "Photo" }).click();
  const uploadPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/recipe-inputs") &&
      response.request().method() === "POST",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "recipe-card.png",
    mimeType: "image/png",
    buffer: cardImage,
  });
  const upload = await uploadPromise;
  expect(upload.status()).toBe(201);
  const { inputId } = (await upload.json()) as { inputId: string };
  try {
    responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/recipe-drafts") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Build recipe" }).click();
    const photoResponse = await responsePromise;
    expect(photoResponse.status()).toBe(429);
    const photoError = await photoResponse.json();
    expect(photoError.error.details).toMatchObject({ required: 7 });
    expect(photoError.error.message).toContain("A photo recipe review needs 7");
    expect(photoResponse.headers()["retry-after"]).toBeTruthy();
    const after = await client
      .from("ai_usage_quota")
      .select("count")
      .eq("user_id", userId)
      .maybeSingle();
    expect(after.error).toBeNull();
    expect(after.data?.count ?? 0).toBe(used);
  } finally {
    const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false },
    });
    const input = await admin
      .from("recipe_inputs")
      .select("object_path")
      .eq("id", inputId)
      .eq("user_id", userId)
      .single();
    if (input.data) {
      await admin.storage
        .from("recipe-inputs")
        .remove([input.data.object_path]);
      await admin
        .from("recipe_inputs")
        .delete()
        .eq("id", inputId)
        .eq("user_id", userId);
    }
  }
});
