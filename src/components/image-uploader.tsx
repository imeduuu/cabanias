"use client";
import { useState } from "react";

export function ImageUploader({ cabinId }: { cabinId: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function upload(form: FormData) {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/imagenes", { method: "POST", body: form });
      const result = await response.json() as { url?: string; alt?: string; error?: string };
      if (!response.ok || !result.url || !result.alt) { setMessage(result.error ?? "No se pudo subir la imagen."); return; }
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="images"]');
      if (!textarea) { setMessage(`Imagen subida. Añade esta URL a la galería: ${result.url} | ${result.alt}`); return; }
      const line = `${result.url} | ${result.alt}`;
      textarea.value = textarea.value.trim() ? `${textarea.value.trimEnd()}\n${line}` : line;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      setMessage("Imagen subida y añadida a la galería. Guarda la ficha para conservar el cambio.");
    } catch { setMessage("No se pudo subir la imagen. Revisa tu conexión e inténtalo nuevamente."); }
    finally { setPending(false); }
  }
  return <section className="image-uploader" aria-labelledby="upload-heading">
    <h3 id="upload-heading">Subir imagen</h3>
    <form action={upload}>
      <input type="hidden" name="cabinId" value={cabinId}/>
      <label className="form-field">Archivo de imagen<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={pending}/></label>
      <label className="form-field">Texto alternativo<input name="alt" maxLength={200} required disabled={pending}/></label>
      <p className="muted">JPEG, PNG o WebP; hasta 5 MiB y entre 320 y 6000 px por lado. Se eliminan los metadatos EXIF.</p>
      <button className="button secondary" disabled={pending}>{pending ? "Subiendo…" : "Subir y añadir a la galería"}</button>
    </form>
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
}
