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
- `npm run db:seed:demo`: cargar datos ficticios de desarrollo de forma explícita.

## Rutas

- `/`: portada pública.
- `/cabanas`: catálogo público.
- `/cabanas/[slug]`: detalle de una cabaña publicada y consulta/envío de solicitud.
- `/login`: acceso de la cuenta administradora.
- `/admin`: resumen de solicitudes pendientes y confirmadas, con accesos de gestión.
- `/admin/cabanas`: listado y gestión de cabañas.
- `/admin/cabanas/nueva` y `/admin/cabanas/[id]`: creación y edición de cabañas.
- `/admin/solicitudes`: listado filtrable de solicitudes; `/admin/solicitudes/[id]`: detalle y gestión de estado.
- `/admin/configuracion`: edición de identidad, contacto, textos, horarios y políticas del negocio.
- `/admin/calendario`: calendario de reservas, solicitudes y bloqueos manuales.

El panel y sus acciones requieren autenticación en el servidor. Las solicitudes públicas quedan pendientes hasta que el administrador las gestiona; los detalles de operación están en [Reservas](docs/reservas.md) y [Panel](docs/panel.md).

## Índice de documentación

- [Reservas, disponibilidad, precios e idempotencia](docs/reservas.md)
- [Panel, catálogo y configuración](docs/panel.md)
- [Calendario y bloqueos manuales](docs/calendario.md)
- [PostgreSQL, Prisma y entorno local](docs/base-de-datos.md)
- [Autenticación y cuenta administradora](docs/autenticacion.md)
