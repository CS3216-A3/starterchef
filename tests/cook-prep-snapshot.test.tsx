import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sourceRecipe: vi.fn(),
}));
vi.mock("@/lib/session-events", () => ({ getSessionById: mocks.session }));
vi.mock("@/lib/data", () => ({ getRecipeById: mocks.sourceRecipe }));
vi.mock("@/components/back-button", () => ({ BackButton: () => null }));
vi.mock("@/components/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

import CookPage from "@/app/(app)/cook/[id]/page";

describe("cooking prep snapshot", () => {
  it("keeps the session ingredients after the source recipe changes", async () => {
    mocks.session.mockResolvedValue({
      id: "session-id",
      user_id: "owner",
      recipe_id: "recipe-id",
      status: "in_progress",
      current_step: 1,
      version: 1,
      recipe: {
        title: "Original curry",
        description: "Original description",
        ingredients: ["chickpeas", "tomato"],
        equipment: ["saucepan"],
        steps: [{ index: 1, title: "Simmer", instruction: "Simmer." }],
      },
    });
    mocks.sourceRecipe.mockResolvedValue({
      id: "recipe-id",
      user_id: "owner",
      ingredients: ["chicken"],
      equipment: ["oven"],
      description: "Rewritten description",
    });
    const page = await CookPage({
      params: Promise.resolve({ id: "session-id" }),
      searchParams: Promise.resolve({ prep: "" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("chickpeas");
    expect(html).toContain("saucepan");
    expect(html).toContain("Original description");
    expect(html).not.toContain("chicken");
    expect(html).not.toContain("Rewritten description");
  });
});
