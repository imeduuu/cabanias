# Cabañas · base reutilizable

[![CI](https://github.com/quesucede/cabanias/actions/workflows/ci.yml/badge.svg)](https://github.com/quesucede/cabanias/actions/workflows/ci.yml)

Aplicación Next.js, React y TypeScript con App Router, PostgreSQL y Prisma. Permite publicar un catálogo de cabañas, recibir solicitudes de reserva y administrarlas desde un panel autenticado. La carga de desarrollo conserva la identidad ficticia «Refugio Claro» y sus ilustraciones SVG; no representa un negocio real.

## Requisitos

Node.js 22.12 o superior compatible con Next.js y Prisma (se recomienda Node 22 LTS), npm y PostgreSQL. Para usar la base local descrita en la documentación también se requiere Docker Desktop con contenedores Linux y Docker Compose.

## Inicio rápido

```sh
npm install
npm run db:local:setup
npm run db:local:up
npm run auth:setup
npm run db:local:migrate
npm run admin:create
npm run dev
```

Abre http://localhost:3000. Para cargar el catálogo ficticio de desarrollo, ejecuta `npm run db:seed:demo`. La configuración de PostgreSQL y de la cuenta administradora está explicada en [Base de datos](docs/base-de-datos.md) y [Autenticación](docs/autenticacion.md).

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm run build` y `npm start`: compilar y servir producción.
- `npm run typecheck`: comprobar tipos.
- `npm run lint`: revisar el código con ESLint y las reglas oficiales de Next.js.
- `npm run check`: ejecutar lint, tipos, pruebas, validación de Prisma y compilación.
- `npm test`: pruebas puras y protecciones de destino.
- `npm run test:postgres`: suite de integración en la base desechable `cabanias_test`.
- `docker compose up -d mailpit`: iniciar el SMTP local de desarrollo en `127.0.0.1:1025` y su interfaz en `127.0.0.1:8025`. Configura `SMTP_*` según `.env.example`.
- `npm run notifications:send`: enviar notificaciones pendientes mediante SMTP. Ejecútalo periódicamente fuera del proceso web; requiere `SMTP_*` y `DATABASE_URL`.
- `npm run test:e2e`: recrear `cabanias_test`, compilar en `.local/next-e2e` y ejecutar Playwright en Chromium de escritorio y móvil. Requiere las variables locales de base de datos configuradas y Chromium instalado (`npx playwright install chromium`).
- `npm run db:seed:demo`: cargar datos ficticios de desarrollo de forma explícita.
- `npm run maintenance:cleanup -- [--apply] [--batch-size=<n>]`: limpieza de mantenimiento; sin opciones solo simula. Ver [Mantenimiento programado](#mantenimiento-programado).

## Mantenimiento programado

`npm run maintenance:cleanup` limpia filas vencidas y anonimiza datos personales de solicitudes terminadas. Los cortes son estrictos (`<`; una fila justo en el corte se conserva):

- `RateLimit`: contadores de cuota cuya última actividad fue hace más de 1 hora.
- `Session` y `Verification`: filas con `expiresAt` anterior al momento de la ejecución.
- `NotificationOutbox`: solo las enviadas (`SENT`) con `sentAt` de hace más de 90 días. Es un respaldo: el worker de notificaciones ya purga a los 30 días. Las filas `ERROR`, `PENDING` y `PROCESSING` no se tocan.
- Nombre, correo y teléfono de solicitudes `REJECTED`, `CANCELLED` o `CONFIRMED` cuya salida supera el plazo configurable de `/admin/configuracion` (24 meses por defecto). Se conservan la solicitud, sus fechas, cabaña, precio, desglose y `BookingSubmission`.

No elimina `BookingRequest` ni `BookingSubmission`; solo anonimiza los tres datos de contacto indicados.

Uso:

```bash
npm run maintenance:cleanup                        # simulación: no modifica datos
npm run maintenance:cleanup -- --apply             # limpia y anonimiza, en lotes de 500 filas
npm run maintenance:cleanup -- --apply --batch-size=1000
```

El `--` es necesario para que npm pase las opciones al script. La simulación es el modo predeterminado. El tamaño de lote admite de 1 a 10000. Por seguridad solo funciona contra la base local de desarrollo (`127.0.0.1:54329/cabanias_dev`, usuario `cabanias_local`, validada con `DATABASE_URL`); rechaza destinos remotos y `cabanias_test`. Consulta [Privacidad de solicitudes](docs/privacidad-solicitudes.md) para conocer el alcance de la anonimización.

Frecuencia recomendada: una vez al día, fuera del proceso web. Ejemplos (ajusta la ruta):

```cron
15 3 * * * cd /ruta/a/cabanias && npm run maintenance:cleanup -- --apply >> /var/log/cabanias-cleanup.log 2>&1
```

```bat
schtasks /Create /SC DAILY /ST 03:15 /TN "Cabanias limpieza" /TR "cmd /c cd /d C:\ruta\cabanias && npm run maintenance:cleanup -- --apply"
```

Códigos de salida: `0` correcto, `1` destino rechazado, identidad de la base distinta o error de base de datos, `2` argumentos inválidos. Dos ejecuciones simultáneas no se corrompen (los lotes usan `FOR UPDATE SKIP LOCKED`), pero conviene evitar que se solapen.

## Rutas

- `/`: portada pública.
- `/cabanas`: catálogo público.
- `/cabanas/[slug]`: detalle de una cabaña publicada, consulta/envío de solicitud y enlace opcional a WhatsApp con mensaje prellenado (cabaña y, tras consultar, fechas y huéspedes; sin datos personales).
- `/login`: acceso de la cuenta administradora.
- `/admin`: resumen de solicitudes pendientes y confirmadas, con accesos de gestión.
- `/admin/cabanas`: listado y gestión de cabañas.
- `/admin/cabanas/nueva` y `/admin/cabanas/[id]`: creación y edición de cabañas.
- `/admin/solicitudes`: listado filtrable de solicitudes; `/admin/solicitudes/[id]`: detalle y gestión de estado.
- `/admin/configuracion`: edición de identidad, contacto público, número de WhatsApp opcional en formato internacional, correo para avisos, textos, horarios y políticas del negocio. El correo para avisos es independiente del contacto público y del acceso administrativo.
- `/admin/calendario`: calendario de reservas, solicitudes y bloqueos manuales.
- `/api/calendar/<token>.ics`: feed iCal de solo lectura con la ocupación de una cabaña (reservas confirmadas y bloqueos como «Ocupado», sin datos personales). El token se genera y rota en `/admin/cabanas/[id]`; se muestra una sola vez. Tras actualizar el código, el desarrollo necesita `npm run db:local:migrate` para aplicar la migración `202611270001_calendar_feed`.

El panel y sus acciones requieren autenticación en el servidor. Las solicitudes públicas quedan pendientes hasta que el administrador las gestiona; los detalles de operación están en [Reservas](docs/reservas.md) y [Panel](docs/panel.md).

## Índice de documentación

- [Reservas, disponibilidad, precios e idempotencia](docs/reservas.md)
- [Panel, catálogo y configuración](docs/panel.md)
- [Calendario y bloqueos manuales](docs/calendario.md)
- [PostgreSQL, Prisma y entorno local](docs/base-de-datos.md)
- [Autenticación y cuenta administradora](docs/autenticacion.md)
