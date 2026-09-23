import { describe, expect, it } from "vitest";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { pantryItemSchema, pantryItemsSchema } from "@/lib/validation/pantry";

describe("kitchen image validation", () => {
  it("accepts a valid PNG and returns its dimensions", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes[16] = 0;
    bytes[17] = 0;
    bytes[18] = 0;
    bytes[19] = 1;
    bytes[20] = 0;
    bytes[21] = 0;
    bytes[22] = 0;
    bytes[23] = 1;
    expect(inspectKitchenImage("image/png", bytes)).toEqual({
      contentType: "image/png",
      extension: "png",
      width: 1,
      height: 1,
    });
  });

  it("rejects images exceeding dimension or megapixel limits", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes[16] = 0;
    bytes[17] = 0;
    bytes[18] = 0x13;
    bytes[19] = 0x88; // 5000
    bytes[20] = 0;
    bytes[21] = 0;
    bytes[22] = 0;
    bytes[23] = 1;
    expect(inspectKitchenImage("image/png", bytes)).toBeNull();
  });

  it("rejects a mismatched signature and disallowed MIME", () => {
    expect(
      inspectKitchenImage("image/png", Uint8Array.from([0xff, 0xd8, 0xff])),
    ).toBeNull();
    expect(
      inspectKitchenImage("image/gif", Uint8Array.from([0x47, 0x49, 0x46])),
    ).toBeNull();
    expect(KITCHEN_IMAGE_MAX_BYTES).toBe(4 * 1024 * 1024);
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
