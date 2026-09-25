import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "docs/product-hunt");
const temp = await mkdtemp(path.join(tmpdir(), "starterchef-launch-"));
await mkdir(path.join(output, "gallery"), { recursive: true });
await mkdir(path.join(output, "screenshots"), { recursive: true });
const submission = JSON.parse(
  await readFile(path.join(output, "submission.json"), "utf8"),
);
assert(submission.tagline.length <= 60);
assert(submission.description.length <= 260);
const adapters = path.join(root, "scripts/product-hunt/browser-stubs.tsx");
await build({
  entryPoints: [path.join(root, "scripts/product-hunt/preview.tsx")],
  outfile: path.join(temp, "preview.js"),
  bundle: true,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_VOICE_PROVIDER": '"openai"',
  },
  plugins: [
    {
      name: "capture-adapters",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(next\/(navigation|image|link)|@\/lib\/posthog\/events|@\/app\/\(app\)\/recipes\/actions)$/,
          },
          (args) => ({ path: args.path, namespace: "capture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "capture" }, (args) => ({
          contents:
            args.path === "next/link"
              ? `export {Link as default} from ${JSON.stringify(adapters)}`
              : args.path === "next/image"
                ? `export {Image as default} from ${JSON.stringify(adapters)}`
                : `export * from ${JSON.stringify(adapters)}`,
          resolveDir: root,
          loader: "tsx",
        }));
      },
    },
  ],
});
const sourceCss = await readFile(
  path.join(root, "src/app/globals.css"),
  "utf8",
);
const { css } = await postcss([tailwind({ base: root })]).process(sourceCss, {
  from: path.join(root, "src/app/globals.css"),
});
await writeFile(
  path.join(temp, "preview.css"),
  `${css}\nbody{font-family: 'Nunito', 'Arial Rounded MT Bold', system-ui, sans-serif}*{animation:none!important;transition:none!important}`,
);
const tokens = [...sourceCss.matchAll(/(--color-[\w-]+):\s*(#[a-f\d]+);/gi)]
  .map((m) => `${m[1]}:${m[2]}`)
  .join(";");
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>';

async function revealFullPage(page) {
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const files = {
    "/preview.js": [path.join(temp, "preview.js"), "text/javascript"],
    "/preview.css": [path.join(temp, "preview.css"), "text/css"],
    "/logo.png": [path.join(root, "public/logo.png"), "image/png"],
  };
  try {
    const entry = files[url.pathname];
    if (url.pathname !== "/" && !entry) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", entry ? entry[1] : "text/html");
    res.end(entry ? await readFile(entry[0]) : html);
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
let browser;
try {
  browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 560, height: 1000 },
    deviceScaleFactor: 1,
    permissions: ["camera"],
  });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Prevent accidental backend/analytics traffic. Only this local server and
  // the explicitly mocked API responses below are available to the harness.
  await context.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  const candidates = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "ingredient",
      name: "Tomatoes",
      quantity: "2",
      expiresOn: null,
      icon: "carrot",
      confidence: "high",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      kind: "equipment",
      name: "Frying pan",
      quantity: null,
      expiresOn: null,
      icon: "cooking-pot",
      confidence: "medium",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      kind: "ingredient",
      name: "Spinach",
      quantity: "1 bunch",
      expiresOn: null,
      icon: "leaf",
      confidence: "low",
    },
  ];
  let scanCandidates = candidates;
  let accepted = [];
  await page.route("**/api/kitchen-scans", (route) =>
    route.fulfill({
      json: { id: "demo-scan", status: "ready", candidates: scanCandidates },
    }),
  );
  await page.route("**/api/kitchen-scans/demo-scan/apply", (route) => {
    accepted.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      json: { error: "Could not save. Please try again." },
    });
  });
  async function scan() {
    await page.goto(`${base}/?view=scan`);
    await page.getByRole("button", { name: "Scan my kitchen" }).click();
    await page.waitForFunction(
      () => document.querySelector("video")?.videoWidth > 0,
    );
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Add to my kitchen" }),
    ).toBeVisible();
  }
  await scan();
  await expect(
    page.getByRole("checkbox", { name: "Select Spinach", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Tomatoes", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Frying pan", exact: true }),
  ).toBeChecked();
  assert.equal(accepted.length, 0, "Scanning must never save automatically");
  await page
    .locator("#capture")
    .screenshot({ path: path.join(output, "screenshots/scan-review.png") });
  await page.getByRole("button", { name: "Add to my kitchen" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  assert.deepEqual(
    accepted[0].map((x) => x.id),
    candidates.slice(0, 2).map((x) => x.id),
    "Uncertain items must stay out of the save payload",
  );
  await page
    .getByRole("textbox", { name: "Spinach name", exact: true })
    .fill("Basil");
  await page
    .getByRole("checkbox", { name: "Select Basil", exact: true })
    .check();
  await page.getByRole("button", { name: "Add to my kitchen" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  assert.equal(
    accepted[1][2].name,
    "Basil",
    "Explicitly confirmed edits must be saved",
  );
  await expect(
    page.getByRole("textbox", { name: "Basil name", exact: true }),
  ).toHaveValue("Basil");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Scan review overflows at ${width}px`,
    );
  }
  scanCandidates = [candidates[2]];
  await scan();
  await expect(
    page.getByRole("button", { name: "Add to my kitchen" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Select Spinach", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Add to my kitchen" }),
  ).toBeEnabled();
  scanCandidates = [];
  await scan();
  await expect(page.getByText(/No items detected/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to my kitchen" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard scan" }).click();
  await expect(
    page.getByRole("button", { name: "Scan my kitchen" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 480, height: 1000 });
  await page.goto(`${base}/?view=recipe`);
  await expect(
    page.getByRole("heading", { name: "Tomato & egg rice" }),
  ).toBeVisible();
  await page
    .locator("#capture")
    .screenshot({ path: path.join(output, "screenshots/recipe.png") });
  await page.route("**/api/ai/assistant", (route) =>
    route.fulfill({
      json: {
        answer:
          "Look for softer edges and a little juice in the pan. If the tomatoes still feel firm, give them another minute and stir gently.",
      },
    }),
  );
  await page.setViewportSize({ width: 560, height: 1100 });
  await page.goto(`${base}/?view=cook`);
  const question = page.getByPlaceholder(
    "Type a question here about this step…",
  );
  await question.fill("How do I know the tomatoes are ready?");
  await question.press("Enter");
  await expect(page.getByText(/Look for softer edges/)).toBeVisible();
  await page
    .locator("#capture")
    .screenshot({ path: path.join(output, "screenshots/cook-assist.png") });

  await page.setViewportSize({ width: 1040, height: 1200 });
  await page.goto(`${base}/?view=landing`);
  await expect(page.getByText("100 / month", { exact: true })).toBeVisible();
  await expect(page.getByText("1,500 / month", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  assert.equal(
    await page.locator("a button").count(),
    0,
    "Links cannot contain buttons",
  );
  await revealFullPage(page);
  await page.screenshot({
    path: path.join(output, "screenshots/landing-desktop.png"),
    fullPage: true,
  });
  await page
    .locator("#pricing")
    .screenshot({ path: path.join(output, "screenshots/pricing.png") });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((element) => element.getBoundingClientRect().right > innerWidth)
        .slice(0, 10)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          right: element.getBoundingClientRect().right,
          text: element.textContent?.trim().slice(0, 80),
        })),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Landing page overflows at ${width}px: ${JSON.stringify(overflow)}`,
    );
  }
  await page.screenshot({
    path: path.join(output, "screenshots/landing-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, [], "No browser runtime errors");

  const data = async (file) =>
    `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
  const logo = await data(path.join(root, "public/logo.png"));
  const panels = [
    {
      file: "01-pantry-to-plate.png",
      eyebrow: "YOUR KITCHEN. YOUR NEXT MEAL.",
      title: "A little help.<br>A meal you<br><em>made yourself.</em>",
      body: "Meet your AI cooking companion.<br>Start with what you have. Find a recipe<br>that fits. Cook one clear step at a time.",
      image: "recipe.png",
      footer: "01 / 04 · FROM PANTRY TO PLATE",
      label: "Recipe card · illustrative demo",
    },
    {
      file: "02-review-your-scan.png",
      eyebrow: "SCAN → REVIEW → ADD",
      title: "AI spots it.<br><em>You check it.</em>",
      body: "Review ingredients and equipment<br>before adding them to your kitchen.<br>Uncertain matches stay unchecked.",
      image: "scan-review.png",
      footer: "02 / 04 · YOU STAY IN CONTROL",
      label: "Kitchen scan · illustrative AI results",
    },
    {
      file: "03-cook-with-help.png",
      eyebrow: "HELP, RIGHT WHEN YOU NEED IT",
      title: "Less guessing.<br><em>More cooking.</em>",
      body: "Follow the current step, set a timer,<br>and ask a question when you get stuck.<br>Keep your attention on the meal.",
      image: "cook-assist.png",
      footer: "03 / 04 · ONE STEP AT A TIME",
      label: "Cook mode · illustrative recipe and response",
    },
    {
      file: "04-launch-plans.png",
      eyebrow: "ROOM TO START. ROOM TO GROW.",
      title: "Start free.<br><em>Cook your way.</em>",
      body: "Core kitchen and recipe tools on both<br>plans. Plus adds voice assistance,<br>photo checkpoints and personal versions.",
      footer: "04 / 04 · PROPOSED LAUNCH PLANS",
      label: "Prices in SGD · credit use varies by action",
    },
  ];
  const creditsBundle = await build({
    entryPoints: [path.join(root, "src/lib/credits.ts")],
    bundle: true,
    format: "esm",
    write: false,
  });
  const { PLANS, TOP_UPS } = await import(
    `data:text/javascript;base64,${Buffer.from(creditsBundle.outputFiles[0].text).toString("base64")}`
  );
  const [free, plus] = PLANS;
  const gallery = await context.newPage();
  await gallery.setViewportSize({ width: 1270, height: 760 });
  for (const panel of panels) {
    const visual = panel.image
      ? `<img class="screen" src="${await data(path.join(output, "screenshots", panel.image))}" alt="${panel.label}">`
      : `<div class="plans"><article><span>FREE STARTER</span><h2>S$0</h2><strong>${free.credits} credits / month</strong><p>Kitchen profile & inventory<br>Recipe book & manual entry<br>Timers & step navigation</p></article><article class="plus"><span>STARTERCHEF PLUS</span><h2>S$${plus.priceSgd.toFixed(2)}<small> / month</small></h2><strong>${plus.credits.toLocaleString("en-SG")} credits / month</strong><p>Or S$${plus.annualPriceSgd.toFixed(2)} / year<br>More AI help, plus voice,<br>photo checkpoints & history</p></article><p class="topups">Top-ups: ${TOP_UPS.map((t) => `${t.credits.toLocaleString("en-SG")} credits / S$${t.priceSgd.toFixed(2)}`).join(" · ")}<br>Top-ups do not unlock Plus-only features.</p></div>`;
    await gallery.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>
      :root{${tokens}}*{box-sizing:border-box}body{margin:0;background:var(--color-cream);color:var(--color-espresso);font-family:'Arial Rounded MT Bold',system-ui,sans-serif}.slide{width:1270px;height:760px;position:relative;overflow:hidden;padding:44px 54px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:25px}.brand img{width:44px;height:44px;object-fit:contain}.eyebrow{font-size:13px;font-weight:800;letter-spacing:2px;color:var(--color-flame);margin-top:76px}h1{font-size:58px;line-height:1.09;letter-spacing:-2.8px;margin:22px 0 24px;font-weight:850}em{font-style:normal;color:var(--color-flame)}.body{font-family:system-ui,sans-serif;font-size:20px;line-height:1.65;font-weight:500}.right{position:absolute;left:650px;top:40px;width:560px;height:666px;border-radius:38px;background:var(--color-oat);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px 18px;gap:12px}.screen{max-height:598px;max-width:508px;object-fit:contain;border-radius:24px;box-shadow:0 14px 36px color-mix(in srgb,var(--color-espresso) 12%,transparent)}.label{font-size:11px;color:var(--color-espresso);font-family:system-ui,sans-serif;font-weight:600}.footer{position:absolute;bottom:40px;left:54px;font-size:11px;letter-spacing:1.6px;font-weight:800}.url{position:absolute;bottom:40px;right:62px;font-size:13px;font-weight:700}.plans{width:100%;padding:5px 10px}.plans article{background:var(--color-card);border-radius:24px;padding:24px 28px;margin-bottom:14px;border:1px solid var(--color-oat-dark)}.plans .plus{border:2px solid var(--color-flame)}.plans span{font-size:12px;letter-spacing:1.6px;font-weight:800}.plans h2{font-size:42px;line-height:1;margin:14px 0;color:var(--color-flame)}.plans small{font-size:17px}.plans strong{font-size:18px}.plans p{font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;margin:13px 0 0}.plans .topups{font-size:12px;text-align:center;line-height:1.8}
      </style><body><div class="slide"><div class="brand"><img src="${logo}" alt="">StarterChef</div><div class="eyebrow">${panel.eyebrow}</div><h1>${panel.title}</h1><p class="body">${panel.body}</p><div class="right">${visual}<div class="label">${panel.label}</div></div><div class="footer">${panel.footer}</div><div class="url">starterchef.vercel.app</div></div></body></html>`);
    await gallery
      .locator("img")
      .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
    await gallery.screenshot({
      path: path.join(output, "gallery", panel.file),
    });
    assert(
      (await stat(path.join(output, "gallery", panel.file))).size < 3_000_000,
    );
  }
  await gallery.setViewportSize({ width: 240, height: 240 });
  await gallery.setContent(
    `<style>body{margin:0;background:var(--color-cream);${tokens};display:grid;place-items:center;height:240px}img{width:190px;height:190px;object-fit:contain}</style><img src="${logo}" alt="StarterChef">`,
  );
  await gallery.locator("img").evaluate((img) => img.decode());
  await gallery.screenshot({
    path: path.join(output, "gallery/thumbnail.png"),
  });
  const report = {
    checks: [
      "High and medium confidence preselected; low confidence unchecked",
      "No automatic save",
      "Save payload excludes unconfirmed items",
      "Edited uncertain item included only after explicit selection",
      "Failed save retains edits and selection",
      "All-low and empty results disable save",
      "Discard returns to scan",
      "320px and 390px layouts have no horizontal overflow",
      "Approved pricing and accessible comparison table rendered",
      "No nested button links",
      "No browser runtime errors",
      "Copy length and gallery file sizes pass",
    ],
    screenshots: 6,
    galleryImages: 4,
    thumbnail: "240x240",
    gallerySize: "1270x760",
    taglineCharacters: submission.tagline.length,
    descriptionCharacters: submission.description.length,
  };
  await writeFile(
    path.join(output, "verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
