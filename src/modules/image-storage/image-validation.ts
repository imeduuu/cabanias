import { DomainError, invariant } from "../bookings/domain";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 6000;
export const MIN_IMAGE_DIMENSION = 320;
export type ImageFormat = "jpeg" | "png" | "webp";
export type ValidatedImage = { buffer: Buffer; format: ImageFormat; width: number; height: number };

function fail(): never { throw new DomainError("INVALID_IMAGE", "La imagen debe ser JPEG, PNG o WebP válido y medir entre 320 y 6000 píxeles por lado."); }
function dimensions(width: number, height: number) {
  invariant(Number.isInteger(width) && Number.isInteger(height) && width >= MIN_IMAGE_DIMENSION && height >= MIN_IMAGE_DIMENSION && width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION,
    "INVALID_IMAGE", "La imagen debe medir entre 320 y 6000 píxeles por lado.");
}

function jpeg(input: Buffer): ValidatedImage {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return fail();
  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2, width = 0, height = 0, ended = false;
  while (offset < input.length) {
    if (input[offset] !== 0xff) return fail();
    const start = offset;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === 0xd9) { parts.push(input.subarray(start, offset)); ended = true; break; }
    if (marker === 0xda) { // Entropy-coded image data may contain escaped marker bytes.
      parts.push(input.subarray(start)); ended = true; break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(input.subarray(start, offset)); continue; }
    if (offset + 2 > input.length) return fail();
    const size = input.readUInt16BE(offset);
    if (size < 2 || offset + size > input.length) return fail();
    const end = offset + size;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (size < 7) return fail();
      height = input.readUInt16BE(offset + 3); width = input.readUInt16BE(offset + 5);
    }
    // APP1 contains EXIF (including GPS) and XMP metadata.
    if (marker !== 0xe1) parts.push(input.subarray(start, end));
    offset = end;
  }
  if (!ended || !width || !height) return fail();
  dimensions(width, height);
  return { buffer: Buffer.concat(parts), format: "jpeg", width, height };
}

function png(input: Buffer): ValidatedImage {
  if (input.length < 33 || !input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return fail();
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  dimensions(width, height);
  const chunks: Buffer[] = [input.subarray(0, 8)];
  let offset = 8, ended = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset), end = offset + 12 + length;
    if (end > input.length) return fail();
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (!(["eXIf", "tEXt", "zTXt", "iTXt"].includes(type))) chunks.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") { ended = true; break; }
  }
  if (!ended) return fail();
  return { buffer: Buffer.concat(chunks), format: "png", width, height };
}

function webp(input: Buffer): ValidatedImage {
  if (input.length < 20 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WEBP" || input.readUInt32LE(4) + 8 !== input.length) return fail();
  let offset = 12, width = 0, height = 0;
  const chunks: Buffer[] = [];
  while (offset + 8 <= input.length) {
    const type = input.toString("ascii", offset, offset + 4), size = input.readUInt32LE(offset + 4), end = offset + 8 + size + (size & 1);
    if (end > input.length) return fail();
    const data = input.subarray(offset + 8, offset + 8 + size);
    if (type === "VP8X" && size >= 10) { width = 1 + data.readUIntLE(4, 3); height = 1 + data.readUIntLE(7, 3); }
    if (type === "VP8 " && size >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) { width = data.readUInt16LE(6) & 0x3fff; height = data.readUInt16LE(8) & 0x3fff; }
    if (type === "VP8L" && size >= 5 && data[0] === 0x2f) { width = 1 + data[1] + ((data[2] & 0x3f) << 8); height = 1 + (data[2] >> 6) + (data[3] << 2) + ((data[4] & 0x0f) << 10); }
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = Buffer.from(input.subarray(offset, end));
      if (type === "VP8X") chunk[8] &= ~0x0c; // Clear the EXIF and XMP feature flags.
      chunks.push(chunk);
    }
    offset = end;
  }
  if (offset !== input.length || !width || !height) return fail();
  dimensions(width, height);
  const body = Buffer.concat(chunks);
  const header = Buffer.from("RIFF\0\0\0\0WEBP", "ascii"); header.writeUInt32LE(body.length + 4, 4);
  return { buffer: Buffer.concat([header, body]), format: "webp", width, height };
}

export function validateAndStripImage(input: Buffer): ValidatedImage {
  invariant(input.length > 0 && input.length <= MAX_IMAGE_BYTES, "INVALID_IMAGE", "La imagen no puede superar 5 MiB.");
  if (input.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) return jpeg(input);
  if (input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return png(input);
  if (input.toString("ascii", 0, 4) === "RIFF") return webp(input);
  return fail();
}
