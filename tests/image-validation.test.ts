import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateAndStripImage } from "../src/modules/image-storage/image-validation";

test("valida PNG real por firma y dimensiones y elimina metadatos de texto", async () => {
  const input = await readFile(path.join(process.cwd(), "artifacts/a11y-audit/360px-cabanas.png"));
  const image = validateAndStripImage(input);
  assert.equal(image.format, "png");
  assert.ok(image.width >= 320 && image.height >= 320);
  assert.ok(!image.buffer.includes(Buffer.from("Software")));
});

test("rechaza contenido que solo declara un MIME de imagen", () => {
  assert.throws(() => validateAndStripImage(Buffer.from("<svg width='900' height='900'>")), /JPEG, PNG o WebP/);
});

test("rechaza imágenes por debajo del mínimo de dimensiones", () => {
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64");
  assert.throws(() => validateAndStripImage(tinyPng), /320 y 6000/);
});

test("rechaza archivos que exceden el límite", () => {
  assert.throws(() => validateAndStripImage(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MiB/);
});

test("reconoce JPEG por segmentos y elimina el segmento APP1 de EXIF", () => {
  const input = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.concat([Buffer.from([0xff, 0xe1, 0, 8]), Buffer.from("Exif\0\0")]),
    Buffer.from([0xff, 0xc0, 0, 11, 8, 1, 64, 1, 64, 1, 1, 0x11, 0]),
    Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3]),
  ]);
  const image = validateAndStripImage(input);
  assert.equal(image.format, "jpeg");
  assert.equal(image.width, 320);
  assert.ok(!image.buffer.includes(Buffer.from("Exif")));
});

test("reconoce WebP por contenedor RIFF y limpia flags/chunks EXIF", () => {
  const vp8x = Buffer.from([0x56,0x50,0x38,0x58,10,0,0,0,0x0c,0,0,0,0x3f,1,0,0x3f,1,0]);
  const exif = Buffer.from([0x45,0x58,0x49,0x46,4,0,0,0,0x45,0x78,0x69,0x66]);
  const body = Buffer.concat([Buffer.from("WEBP"), vp8x, exif]);
  const riff = Buffer.alloc(8); riff.write("RIFF"); riff.writeUInt32LE(body.length, 4);
  const image = validateAndStripImage(Buffer.concat([riff, body]));
  assert.equal(image.format, "webp");
  assert.equal(image.width, 320);
  assert.equal(image.buffer.readUInt8(20) & 0x0c, 0);
  assert.ok(!image.buffer.includes(Buffer.from("Exif")));
});
