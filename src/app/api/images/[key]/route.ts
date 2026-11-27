import { imageStorage } from "@/modules/image-storage/port";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const image = await imageStorage().read(key);
  if (!image) return new Response("No encontrada", { status: 404 });
  const type = key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp";
  return new Response(new Uint8Array(image), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
