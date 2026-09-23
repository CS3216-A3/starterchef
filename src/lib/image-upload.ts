export const KITCHEN_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const TYPES = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      ),
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
  },
} as const;

export type KitchenImageType = keyof typeof TYPES;

export function inspectKitchenImage(
  declaredType: string,
  bytes: Uint8Array,
): { contentType: KitchenImageType; extension: string } | null {
  if (!(declaredType in TYPES)) return null;
  const contentType = declaredType as KitchenImageType;
  const rule = TYPES[contentType];
  return rule.matches(bytes)
    ? { contentType, extension: rule.extension }
    : null;
}
