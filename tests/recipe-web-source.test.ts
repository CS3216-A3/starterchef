import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("recipe-scrapers", () => ({
  scrapeRecipe: vi.fn(async () => ({
    success: true,
    data: {
      name: "Soup",
      recipeIngredient: ["water"],
      recipeInstructions: ["Boil"],
    },
  })),
}));

import {
  assertPublicRecipeUrl,
  isReservedAddress,
  loadRecipeWebSource,
} from "@/lib/recipe-web-source";

describe("permissive public recipe URLs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: "93.184.215.14" }]);
  });

  it("accepts arbitrary public HTTP and HTTPS hosts", async () => {
    expect(await assertPublicRecipeUrl("https://food.example.org/recipe")).toBe(
      "https://food.example.org/recipe",
    );
    expect(await assertPublicRecipeUrl("http://my-blog.example.net/soup")).toBe(
      "http://my-blog.example.net/soup",
    );
  });

  it("rejects literal, mapped IPv6, and DNS resolved private addresses", async () => {
    for (const host of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "192.168.1.4",
      "::1",
      "::ffff:7f00:1",
      "fc00::1",
      "ff02::1",
    ])
      expect(isReservedAddress(host)).toBe(true);
    await expect(
      assertPublicRecipeUrl("http://127.0.0.1/private"),
    ).rejects.toThrow(/publicly reachable/);
    lookup.mockResolvedValueOnce([{ address: "192.168.0.1" }]);
    await expect(
      assertPublicRecipeUrl("https://food.example.org/recipe"),
    ).rejects.toThrow(/public/);
    expect(isReservedAddress("198.51.100.3")).toBe(true);
    expect(isReservedAddress("203.0.113.3")).toBe(true);
    expect(isReservedAddress("198.51.101.3")).toBe(false);
    expect(isReservedAddress("203.0.114.3")).toBe(false);
  });

  it("checks every redirect before a second fetch", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).rejects.toThrow(/publicly reachable/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("rejects a private DNS answer at connection time after a public preflight", async () => {
    lookup
      .mockReset()
      .mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).rejects.toThrow(/fetch failed/);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("reads a public recipe with a bounded body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>recipe</html>", { status: 200 }),
    );
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).resolves.toContain("Title: Soup");
  });

  it("falls back to a Wayback snapshot when the site refuses the fetch", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher
      .mockResolvedValueOnce(new Response("blocked", { status: 402 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: {
                available: true,
                status: "200",
                url: "http://web.archive.org/web/2025/https://food.example.org/recipe",
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("<html>recipe</html>", { status: 200 }),
      );
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).resolves.toContain("Title: Soup");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[1][0])).toContain(
      "archive.org/wayback/available",
    );
    expect(String(fetcher.mock.calls[2][0])).toContain(
      "https://web.archive.org/web/2025/",
    );
  });

  it("keeps the block error when nothing is archived", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ archived_snapshots: {} }), {
          status: 200,
        }),
      );
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).rejects.toThrow(/403/);
  });

  it("does not consult the archive for other HTTP errors", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("gone", { status: 404 }));
    await expect(
      loadRecipeWebSource("https://food.example.org/recipe"),
    ).rejects.toThrow(/404/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
