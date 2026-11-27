# Despliegue

La primera opción documentada es una VM de OCI Always Free con Docker Compose, PostgreSQL 17 y Caddy como proxy HTTPS. Revisa antes los límites y supuestos en [la decisión de hosting](decisiones/hosting.md). Esta guía prepara la operación; no despliega ni aprovisiona infraestructura.

## Variables y secretos

Configura estas variables en el gestor de secretos del host/Compose. No las incluyas en el repositorio, argumentos de comandos, logs ni imagen Docker. `DATABASE_URL` debe apuntar a PostgreSQL remoto con usuario de aplicación de privilegios mínimos; protege el transporte con TLS según el proveedor y restringe la red para que solo la VM pueda conectarse.

- `DATABASE_URL`: cadena PostgreSQL de producción, con esquema `public`.
- `BETTER_AUTH_URL`: URL pública canónica con `https://`, por ejemplo `https://reservas.ejemplo.cl`.
- `BETTER_AUTH_SECRET`: secreto único y aleatorio de al menos 32 caracteres. Genera uno con un gestor de secretos; no reutilices el de desarrollo.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `SMTP_SECURE`: datos del proveedor SMTP. Usa remitente verificado; `SMTP_SECURE=true` para TLS implícito (habitualmente puerto 465) y `false` para STARTTLS (habitualmente 587), conforme al proveedor.

El `.dockerignore` excluye `.env*` y `.local`; la imagen se construye desde `Dockerfile` multi-etapa y ejecuta Next como usuario `nextjs` sin privilegios. Pasa los secretos al contenedor en tiempo de ejecución. Usa un volumen persistente para los datos PostgreSQL; la imagen de la aplicación no debe almacenar datos persistentes. El puerto 3000 queda detrás de Caddy y no se publica directamente a Internet.

`SITE_URL` define la URL canónica HTTPS del sitio; configúrala en producción para generar correctamente Open Graph, el sitemap y JSON-LD.

## Preparar PostgreSQL

Usa PostgreSQL 17 o una versión compatible aprobada por el hosting. La migración inicial instala `btree_gist`; valida que la extensión esté disponible en el servidor:

```sql
SELECT name, default_version
FROM pg_available_extensions
WHERE name = 'btree_gist';
```

Aplica exclusivamente las migraciones versionadas:

```sh
npm run db:deploy
```

`db:deploy` ejecuta `prisma migrate deploy`; nunca uses `prisma db push` en producción. El usuario de migraciones necesita permisos para crear la extensión si aún no existe. Comprueba su instalación luego de migrar con `SELECT extname FROM pg_extension WHERE extname = 'btree_gist';`.

## Primera cuenta administradora

Ejecuta el comando desde un checkout de la versión publicada, con dependencias instaladas, en una terminal interactiva con `DATABASE_URL` de producción cargada de forma segura. Para evitar que un comando cotidiano apunte accidentalmente a una base remota, el script requiere las dos variables de opt-in siguientes y rechaza `cabanias_dev`, `cabanias_test` y localhost. La contraseña se solicita de forma interactiva y no se acepta por argumentos ni pipes.

```sh
NODE_ENV=production CABANIAS_ALLOW_PRODUCTION_DATABASE=1 npm run admin:create
```

No ejecutes `db:deploy` ni `admin:create` desde cada arranque del contenedor.

## Tareas programadas

Programa tareas en el host, en UTC, desde un checkout de la versión publicada con Node 22 y dependencias instaladas. No están incluidas en la imagen standalone web. Carga el entorno de producción desde un gestor de secretos. Registra códigos de salida y errores sin datos personales; evita ejecuciones solapadas.

- `npm run notifications:send`: cada 5 minutos como punto de partida; requiere `DATABASE_URL` y `SMTP_*`.
- `NODE_ENV=production CABANIAS_ALLOW_PRODUCTION_DATABASE=1 npm run maintenance:cleanup -- --apply`: una vez al día. En producción la limpieza exige el mismo opt-in y verifica la identidad de la base antes de modificar filas.

## Revisión antes de aceptar reservas

- [ ] Confirmar DNS, certificado HTTPS renovable en Caddy y `BETTER_AUTH_URL` canónica.
- [ ] Confirmar que el firewall expone solo HTTPS y que PostgreSQL no acepta conexiones públicas.
- [ ] Revisar la versión de Node 22 y PostgreSQL 17; construir la imagen y confirmar que `.env*` y `.local` no aparecen en su contenido.
- [ ] Aplicar `npm run db:deploy`; confirmar `btree_gist` instalada y migraciones esperadas.
- [ ] Crear la cuenta con `npm run admin:create` bajo el opt-in de producción e iniciar sesión por HTTPS.
- [ ] Consultar `GET /api/health`: debe responder `200` con `{"status":"ok"}` cuando la base responde y `503` con `{"status":"unavailable"}` cuando no; ninguna respuesta incluye errores de conexión.
- [ ] Verificar correo real con SMTP y el procesamiento de notificaciones; verificar que los cron ejecuten ambos comandos y alerten ante fallos.
- [ ] Confirmar persistencia tras reiniciar contenedores y completar una copia cifrada externa y una restauración en una base aislada.
- [ ] Revisar memoria, disco, logs, espacio de backups y alertas de gasto; acordar explícitamente el riesgo de una sola VM antes de operar.
- [ ] Ejecutar `npm test`, `npm run typecheck`, `npm run build` y `npm run test:postgres` antes de publicar una versión.
