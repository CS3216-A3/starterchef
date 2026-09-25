import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Run after npm run build and npm run start -- --port 3100.
const base = process.env.LAUNCH_PREVIEW_URL ?? "http://127.0.0.1:3100";
const output = fileURLToPath(
  new URL("../../docs/product-hunt/", import.meta.url),
);

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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await expect(page).toHaveTitle("StarterChef · Your start to great cooking");
  await expect(page.locator("h1")).toHaveCount(1);
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  assert.equal(new URL(canonical).href, "https://starterchef.vercel.app/");
  assert(
    await page.locator('meta[name="description"]').getAttribute("content"),
  );
  assert.equal(
    await page.locator('meta[name="twitter:card"]').getAttribute("content"),
    "summary_large_image",
  );
  const image = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  assert(image.startsWith("https://starterchef.vercel.app/"));
  const og = new URL(image);
  const ogResponse = await page.request.get(
    `${base}${og.pathname}${og.search}`,
  );
  assert.equal(ogResponse.status(), 200);
  assert.match(ogResponse.headers()["content-type"], /image\/png/);
  const png = await ogResponse.body();
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  await writeFile(`${output}screenshots/opengraph.png`, png);
  await page.evaluate(() => document.fonts.ready);
  await revealFullPage(page);
  await page.screenshot({
    path: `${output}screenshots/landing-production-desktop.png`,
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("table", {
        name: "Compare Free Starter and StarterChef Plus features",
      }),
    ).toBeVisible();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}px`,
    );
  }
  await page.screenshot({
    path: `${output}screenshots/landing-production-mobile.png`,
    fullPage: true,
  });
  assert.equal(await page.locator("a button").count(), 0);
  await expect(page.getByText("100 / month", { exact: true })).toBeVisible();
  await expect(page.getByText("1,500 / month", { exact: true })).toBeVisible();
  const robots = await page.request.get(`${base}/robots.txt`);
  assert.equal(robots.status(), 200);
  assert.match(
    await robots.text(),
    /Sitemap: https:\/\/starterchef.vercel.app\/sitemap.xml/,
  );
  const sitemap = await page.request.get(`${base}/sitemap.xml`);
  assert.equal(sitemap.status(), 200);
  assert.match(await sitemap.text(), /https:\/\/starterchef.vercel.app/);
  assert.deepEqual(errors, []);
  const report = {
    productionBuild: true,
    status: 200,
    canonical,
    title: await page.title(),
    openGraph: "1200x630 PNG, HTTP 200",
    twitter: "summary_large_image",
    robotsAndSitemap: "HTTP 200; production domain",
    mobileWidths: [320, 390],
    browserErrors: errors,
  };
  await writeFile(
    `${output}site-verification.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
