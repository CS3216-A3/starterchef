import { describe, expect, it } from "vitest";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { pantryItemSchema, pantryItemsSchema } from "@/lib/validation/pantry";

describe("kitchen image validation", () => {
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff], "jpg"],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "png"],
    [
      "image/webp",
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      "webp",
    ],
  ])("accepts a valid %s signature", (type, signature, extension) => {
    expect(inspectKitchenImage(type, Uint8Array.from(signature))).toEqual({
      contentType: type,
      extension,
    });
  });

  it("rejects a mismatched signature and disallowed MIME", () => {
    expect(
      inspectKitchenImage("image/png", Uint8Array.from([0xff, 0xd8, 0xff])),
    ).toBeNull();
    expect(
      inspectKitchenImage("image/gif", Uint8Array.from([0x47, 0x49, 0x46])),
    ).toBeNull();
    expect(KITCHEN_IMAGE_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("pantry validation", () => {
  it("trims accepted values", () => {
    expect(
      pantryItemSchema.parse({
        kind: "ingredient",
        name: "  Tomato  ",
        quantity: " 2 ",
      }),
    ).toMatchObject({ name: "Tomato", quantity: "2" });
  });

  it("rejects expiry on equipment, oversized names, and oversized batches", () => {
    expect(
      pantryItemSchema.safeParse({
        kind: "equipment",
        name: "Pan",
        expiresOn: "2027-01-01",
      }).success,
    ).toBe(false);
    expect(
      pantryItemSchema.safeParse({ kind: "ingredient", name: "x".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      pantryItemsSchema.safeParse(
        Array.from({ length: 101 }, () => ({
          kind: "ingredient",
          name: "Rice",
        })),
      ).success,
    ).toBe(false);
  });
});
