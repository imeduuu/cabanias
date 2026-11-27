import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredImage = { key: string; url: string };
export interface ImageStorage { save(buffer: Buffer, extension: "jpg" | "png" | "webp"): Promise<StoredImage>; read(key: string): Promise<Buffer | null> }

export class FileSystemImageStorage implements ImageStorage {
  constructor(private readonly directory: string) {}
  async save(buffer: Buffer, extension: "jpg" | "png" | "webp") {
    const key = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ this.directory, key), buffer, { flag: "wx", mode: 0o644 });
    return { key, url: `/api/images/${key}` };
  }
  async read(key: string) {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key)) return null;
    try { return await readFile(path.join(/*turbopackIgnore: true*/ this.directory, key)); } catch { return null; }
  }
}

export class LocalDevelopmentImageStorage extends FileSystemImageStorage {
  constructor() { super(path.join(process.cwd(), ".local", "uploads")); }
}

export class OciVolumeImageStorage extends FileSystemImageStorage {
  constructor(directory = "/data/images") { super(directory); }
}

export function imageStorage(): ImageStorage {
  const configured = process.env.IMAGE_STORAGE_DIR;
  if (configured) return new FileSystemImageStorage(configured);
  if (process.env.NODE_ENV === "production" && process.env.E2E_TEST !== "1") return new OciVolumeImageStorage();
  return new LocalDevelopmentImageStorage();
}
