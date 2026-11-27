import { requireAdmin } from "@/lib/require-admin";
import { getDb } from "@/lib/db";
import { DomainError } from "@/modules/bookings/domain";
import { validateAndStripImage, MAX_IMAGE_BYTES } from "@/modules/image-storage/image-validation";
import { imageStorage } from "@/modules/image-storage/port";

export const runtime = "nodejs";
export async function POST(request: Request) {
  await requireAdmin();
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES + 64 * 1024) return Response.json({ error: "La imagen no puede superar 5 MiB." }, { status: 413 });
    const form = await request.formData();
    const cabinId = form.get("cabinId"), alt = form.get("alt"), file = form.get("image");
    if (typeof cabinId !== "string" || !/^[0-9a-f-]{36}$/i.test(cabinId)) throw new DomainError("INVALID_INPUT", "Selecciona una cabaña válida.");
    if (typeof alt !== "string" || !alt.trim() || alt.trim().length > 200) throw new DomainError("INVALID_IMAGE", "El texto alternativo es obligatorio y admite hasta 200 caracteres.");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new DomainError("INVALID_IMAGE", "Selecciona una imagen de hasta 5 MiB.");
    const cabin = await getDb().cabin.findUnique({ where: { id: cabinId }, select: { id: true } });
    if (!cabin) throw new DomainError("NOT_FOUND", "La cabaña ya no existe.");
    const image = validateAndStripImage(Buffer.from(await file.arrayBuffer()));
    const stored = await imageStorage().save(image.buffer, image.format === "jpeg" ? "jpg" : image.format);
    return Response.json({ ...stored, alt: alt.trim() }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Response) return error;
    return Response.json({ error: "No se pudo subir la imagen." }, { status: 500 });
  }
}
