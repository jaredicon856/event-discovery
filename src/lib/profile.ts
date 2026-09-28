import sharp from "sharp";

export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;

export type ValidatedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  sanitizedBytes: Uint8Array;
};

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export async function validateProfileImage(bytes: Uint8Array): Promise<ValidatedImage> {
  if (bytes.length === 0 || bytes.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Photo must be smaller than 2 MB");
  }

  let result: Omit<ValidatedImage, "sanitizedBytes"> | null = null;
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    result = {
      mimeType: "image/png",
      extension: "png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) {
    const dimensions = jpegDimensions(bytes);
    if (dimensions) result = { mimeType: "image/jpeg", extension: "jpg", ...dimensions };
  } else if (
    bytes.length >= 30 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    const chunk = readAscii(bytes, 12, 4);
    if (chunk === "VP8X") {
      result = {
        mimeType: "image/webp",
        extension: "webp",
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    } else if (chunk === "VP8 " && bytes.length >= 30) {
      result = {
        mimeType: "image/webp",
        extension: "webp",
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    } else if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      result = {
        mimeType: "image/webp",
        extension: "webp",
        width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
        height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)),
      };
    }
  }

  if (!result || result.width < 1 || result.height < 1) {
    throw new Error("Photo content must be a valid JPEG, PNG, or WebP image");
  }
  if (result.width > MAX_IMAGE_DIMENSION || result.height > MAX_IMAGE_DIMENSION) {
    throw new Error("Photo dimensions must not exceed 4096 × 4096 pixels");
  }
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION })
      .metadata();
  } catch {
    throw new Error("Photo content could not be decoded as an image");
  }
  const expectedFormat =
    result.extension === "jpg" ? "jpeg" : result.extension;
  if (
    metadata.format !== expectedFormat ||
    metadata.width !== result.width ||
    metadata.height !== result.height
  ) {
    throw new Error("Photo content does not match its image signature");
  }
  const pipeline = sharp(bytes, {
    limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION,
  })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true });
  const sanitized =
    result.extension === "jpg"
      ? await pipeline.jpeg({ quality: 88 }).toBuffer()
      : result.extension === "png"
        ? await pipeline.png().toBuffer()
        : await pipeline.webp({ quality: 88 }).toBuffer();
  return { ...result, sanitizedBytes: sanitized };
}
