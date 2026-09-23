export const KITCHEN_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const KITCHEN_IMAGE_MAX_DIMENSION = 4096;
export const KITCHEN_IMAGE_MAX_PIXELS = 12_000_000;

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
): {
  contentType: KitchenImageType;
  extension: string;
  width: number;
  height: number;
} | null {
  if (!(declaredType in TYPES)) return null;
  const contentType = declaredType as KitchenImageType;
  const rule = TYPES[contentType];
  if (!rule.matches(bytes)) return null;
  const dimensions = imageDimensions(contentType, bytes);
  if (!dimensions) return null;
  const { width, height } = dimensions;
  if (
    width < 1 ||
    height < 1 ||
    width > KITCHEN_IMAGE_MAX_DIMENSION ||
    height > KITCHEN_IMAGE_MAX_DIMENSION ||
    width * height > KITCHEN_IMAGE_MAX_PIXELS
  )
    return null;
  return { contentType, extension: rule.extension, width, height };
}

function imageDimensions(type: KitchenImageType, bytes: Uint8Array) {
  if (type === "image/png" && bytes.length >= 24) {
    return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }
  if (type === "image/jpeg") return jpegDimensions(bytes);
  return webpDimensions(bytes);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 2 ** 24 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const chunk = new TextDecoder().decode(bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (
    chunk === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: ((bytes[27] & 0x3f) << 8) + bytes[26],
      height: ((bytes[29] & 0x3f) << 8) + bytes[28],
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const value =
      bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + (bytes[24] << 24);
    return {
      width: (value & 0x3fff) + 1,
      height: ((value >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}
