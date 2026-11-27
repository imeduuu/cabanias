# Despliegue

La arquitectura de producción utiliza **Vercel** para el alojamiento del frontend y las funciones serverless de Next.js, **Neon** como base de datos PostgreSQL externa y **Vercel Blob / Cloudflare R2** para el almacenamiento de imágenes. Esta guía asume un presupuesto de $0 (planes gratuitos).

## Variables y secretos

Configura estas variables en el panel de Vercel (Project Settings -> Environment Variables). No las incluyas en el repositorio.

- `DATABASE_URL`: Cadena de conexión PostgreSQL *pooled* de Neon (debe incluir `-pooler` en el host y `sslmode=require`).
- `BETTER_AUTH_URL`: URL pública canónica con `https://` (ej. `https://tu-proyecto.vercel.app` o tu dominio propio).
- `BETTER_AUTH_SECRET`: Secreto único y aleatorio de al menos 32 caracteres.
- `SITE_URL`: URL canónica HTTPS del sitio, para generar Open Graph, sitemap y JSON-LD.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `SMTP_SECURE`: Datos del proveedor SMTP.

**Nota sobre imágenes:** El sistema de archivos de Vercel es de solo lectura. La variable `IMAGE_STORAGE_DIR` ya no se utiliza. Se debe implementar el SDK de Vercel Blob o Cloudflare R2 para subir y almacenar las imágenes (JPEG, PNG o WebP de hasta 5 MiB).

## Preparar PostgreSQL (Neon)

1. Crea un proyecto en [Neon](https://neon.tech) y obtén la cadena de conexión *pooled*.
2. Ejecuta las migraciones desde tu entorno local (no en Vercel) apuntando a la base de datos de producción:
   ```sh
   npm run db:deploy