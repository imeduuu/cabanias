## PostgreSQL y Prisma

Configuración, cabañas, imágenes, servicios y tarifas están conectados a PostgreSQL. `BookingRequest`, `ManualBlock` y `Occupancy` conservan sus reglas y ahora se reutilizan en el flujo público de consulta y solicitud; la gestión administrativa de solicitudes está conectada con acceso protegido. Prisma y su cliente permanecen en **7.10.1**, con `@prisma/adapter-pg`; `npm install` genera el cliente sin conectarse a la base.

El entorno local Docker ya se preparó y sus cuatro migraciones se aplicaron en `cabanias_dev`. También se aplicaron desde cero en una base desechable `cabanias_test` para ejecutar integración. No se creó una base alojada ni se usaron credenciales de producción. Para otros entornos PostgreSQL 15 o superior, el proceso manual es:

1. Copiar `.env.example` a `.env` y completar `DATABASE_URL` con una conexión propia.
2. El usuario de migración debe poder crear la extensión `btree_gist`, o un administrador debe habilitarla previamente.
3. Ejecutar:

```sh
npm run db:validate
npm run db:generate
npm run db:deploy
```

`db:deploy` ejecuta `prisma migrate deploy` y aplica las migraciones versionadas disponibles (la quinta queda pendiente en desarrollo hasta que el dueño decida aplicarla). No usar `db push`: omitiría las restricciones y triggers SQL escritos a mano. Tampoco usar `migrate resolve --applied` para simular una ejecución. La primera migración se generó con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`; la segunda agrega las reglas que Prisma no representa. Las migraciones futuras deben preservar esas reglas.

`src/lib/db.ts` provee el cliente solo para servidor. `src/lib/admin-data.ts` protege cada lectura administrativa con `requireAdmin()`, al igual que cada acción en `src/app/admin/manage-actions.ts`. `src/lib/public-data.ts` entrega la configuración pública y solo cabañas `PUBLISHED`, sin datos de autenticación ni reservas.

Los servicios internos de configuración y precios se usan desde acciones autenticadas y validan los cambios antes de guardarlos. Las temporadas usan fechas locales `[inicio, fin)`, sin superposición por cabaña; reemplazan la tarifa base, no se acumulan.

### Reglas de intervalos y precios

Las solicitudes nocturnas reciben fechas `YYYY-MM-DD`; se convierten a instantes en `America/Santiago` con entrada a las 15 y salida a las 11 por defecto, configurables en `BusinessSettings`. Se cobra cada noche por su fecha local de llegada, excluyendo el día de salida. Los cambios de horario no alteran el número de noches.

Como regla inicial explícita del dominio, los arriendos por hora empiezan y terminan en horas en punto y duran horas completas. Reciben ISO 8601 con `Z` u offset obligatorio; se cobran horas efectivamente transcurridas y se usa la fecha local de cada hora para elegir temporada. Se rechazan horas locales ambiguas o inexistentes al convertir fechas nocturnas. Ambas modalidades admiten un máximo técnico de 366 días por solicitud para limitar el cálculo.

Los precios son enteros CLP no negativos, con límite `Int` de PostgreSQL. Se guarda el total estimado junto con un desglose inmutable de tarifa, temporada, unidades, zona y moneda; confirmar no recalcula precios. Se guardan nombre, correo, teléfono opcional y cantidad de huéspedes, sin documentos ni datos de tarjetas.

Los intervalos ocupados son `[startsAt, endsAt)`: dos estadías contiguas no se solapan. Solo `CONFIRMED` y los bloqueos ocupan disponibilidad. Los servicios serializan las operaciones de cada cabaña con `SELECT ... FOR UPDATE`, releen la solicitud y comprueban disponibilidad antes de confirmar. Triggers sincronizan `Occupancy` y una restricción `EXCLUDE USING gist` rechaza solapamientos incluso en escrituras concurrentes fuera del servicio. Cancelar o eliminar el origen libera la ocupación. `Occupancy` no debe editarse directamente; un trigger rechaza escrituras directas.

Las transiciones permitidas son `PENDING → CONFIRMED / REJECTED / CANCELLED` y `CONFIRMED → CANCELLED`. Los términos de una solicitud son inmutables; para cambiar fechas, cantidad o tarifa se crea otra solicitud. Una cabaña con historial de solicitudes no puede cambiar de modalidad. No puede reducirse su capacidad por debajo de solicitudes pendientes o confirmadas.

### Pruebas

```sh
npm test
npm run typecheck
npm run build
```

`npm test` ejecuta solo las pruebas puras y las protecciones de destino, sin conexión a PostgreSQL. Para integración usa `npm run test:postgres`: crea un contenedor local desechable, verifica su identidad, aplica las migraciones, ejecuta las pruebas y lo elimina al terminar. La suite solo admite `127.0.0.1:54330/cabanias_test` con el usuario local y esquema `public`; rechaza el destino de desarrollo y destinos remotos. Incluye confirmaciones simultáneas, bloqueo contra confirmación, escrituras directas, cancelación, extremos contiguos y rollback de bloqueos incompatibles.

## PostgreSQL local con Docker Compose

Requiere Docker Desktop iniciado con contenedores Linux y Docker Compose. Desde la raíz del proyecto:

```sh
# Una sola vez por checkout: genera secretos aleatorios locales, sin mostrarlos.
npm run db:local:setup

# Inicia PostgreSQL y espera su healthcheck.
npm run db:local:up

# Verifica DATABASE_URL e identidad del contenedor antes de migrar.
npm run db:local:migrate

# Base de pruebas separada, migraciones desde cero y suite completa.
npm run test:postgres

# Detiene y elimina contenedores/red del proyecto; conserva el volumen de desarrollo.
npm run db:local:down
```

| Uso | Servicio | Conexión local | Almacenamiento |
| --- | --- | --- | --- |
| Desarrollo | `postgres` | `127.0.0.1:54329/cabanias_dev` | Volumen `cabanias-local_postgres_data` |
| Pruebas | `postgres-test` | `127.0.0.1:54330/cabanias_test` | `tmpfs`, eliminado con el contenedor |

`compose.yaml` usa la imagen oficial `postgres:17-bookworm`, zona `America/Santiago`, puertos enlazados exclusivamente a loopback y secretos montados mediante `POSTGRES_PASSWORD_FILE`. Cada servicio tiene su contraseña independiente. El usuario `cabanias_local` es administrador **solo de este entorno de desarrollo**, necesario para instalar `btree_gist`; no es una configuración de producción.

El script guarda contraseñas en `.local/dev-password` y `.local/test-password`, y las URLs en `.env`. Ambos destinos están ignorados por Git. No copiar esos archivos al repositorio ni compartir su contenido. No borrar los secretos si se quiere reutilizar el volumen: cambiar el archivo no cambia automáticamente la contraseña ya inicializada en PostgreSQL.

`setup` conserva una configuración local ya generada y rechaza conexiones existentes que no coincidan; no sustituye conexiones ajenas. El ejecutor valida host, puerto, nombre de base, usuario, esquema y credenciales locales; además compara el identificador del clúster conectado por TCP con el del contenedor Compose antes de migrar. Las variables heredadas del shell también se validan. Los scripts no imprimen contraseñas.

`test:postgres` no cambia la URL de desarrollo del archivo `.env`; pasa la conexión de pruebas solo al proceso de migración correspondiente. Cada ejecución recrea únicamente `postgres-test` y limpia ese contenedor incluso si las pruebas fallan. No ejecuta `DROP DATABASE`, `migrate reset` ni toca el volumen de desarrollo.

Para volver a trabajar tras detener Docker, basta `npm run db:local:up`. Se comprobó la persistencia deteniendo y recreando el contenedor de desarrollo y verificando que las migraciones seguían aplicadas. No usar `docker compose down --volumes` si quieres conservar los datos. El catálogo y la identidad se leen desde PostgreSQL y el sitio recibe solicitudes pendientes, sin confirmarlas automáticamente.
