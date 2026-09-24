import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AI_OPERATION_COSTS } from "@/lib/ai/route";
import {
  privateMediaPath,
  privateMediaReference,
  resolveMediaReference,
} from "@/lib/private-media";
import {
  createRecipeSchema,
  feedbackSchema,
  profileInputSchema,
  uuidSchema,
} from "@/lib/validation/actions";

describe("server-owned AI costs", () => {
  it("uses the documented fixed credit weights", () => {
    expect(AI_OPERATION_COSTS).toEqual({
      "kitchen-voice": 1,
      assistant: 1,
      "realtime-session": 1,
      suggestions: 2,
      edit: 2,
      adapt: 2,
      "step-check": 2,
      scan: 3,
      import: 3,
    });
  });
});

describe("private media references", () => {
  it("persists an opaque reference and signs it only through the owner client", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.invalid/object?token=short-lived" },
      error: null,
    });
    const supabase = {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    };
    const path = "user-a/checkpoints/photo.jpg";
    const reference = privateMediaReference(path);
    expect(privateMediaPath(reference)).toBe(path);
    await expect(
      resolveMediaReference(supabase as never, reference),
    ).resolves.toContain("token=short-lived");
    expect(createSignedUrl).toHaveBeenCalledWith(path, 600);
  });

  it("leaves public catalogue URLs unchanged", async () => {
    const supabase = { storage: { from: vi.fn() } };
    await expect(
      resolveMediaReference(
        supabase as never,
        "https://catalogue.invalid/image.jpg",
      ),
    ).resolves.toBe("https://catalogue.invalid/image.jpg");
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});

describe("server action schemas", () => {
  it("rejects invalid ownership ids and unsafe profile/feedback values", () => {
    expect(uuidSchema.safeParse("not-an-id").success).toBe(false);
    expect(
      profileInputSchema.safeParse({
        displayName: "Chef",
        dietaryRestrictions: [],
        allergies: [],
        skillLevel: "expert",
        householdSize: 0,
      }).success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        recipeId: crypto.randomUUID(),
        rating: 9,
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed recipes before a mutation", () => {
    expect(
      createRecipeSchema.safeParse({ title: "Missing everything" }).success,
    ).toBe(false);
  });
});

describe("client credential exposure", () => {
  it("contains no browser-visible provider key names in application source", () => {
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/NEXT_PUBLIC_(?:OPENAI|GOOGLE).*KEY/);
  });
});
