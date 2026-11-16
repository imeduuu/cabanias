# Cabañas · base reutilizable

Aplicación Next.js, React y TypeScript con App Router, PostgreSQL y Prisma. Configuración, catálogo y tarifas se administran en el panel autenticado y se muestran desde PostgreSQL. La carga de desarrollo conserva la identidad ficticia «Refugio Claro» y sus ilustraciones SVG; no representa un negocio real.

## Levantar el proyecto

Requiere Node.js 22.12 o superior compatible con Next.js y Prisma (se recomienda Node 22 LTS) y npm.

```sh
npm install
npm run dev
```

Abrir http://localhost:3000. El sitio y el panel requieren PostgreSQL iniciado y `.env` configurado. Ver los pasos siguientes para preparar datos y acceso.

```sh
npm run typecheck
npm run build
npm start
```

`npm start` sirve la compilación de producción después de `npm run build`.

## Rutas

- `/`: inicio público.
- `/cabanas`: catálogo con filtro local por modalidad.
- `/cabanas/bosque`, `/cabanas/rio`, `/cabanas/cerro`: detalle de ejemplo.
- `/admin`: resumen de demostración.
- `/admin/cabanas`: fichas de ejemplo.
- `/admin/solicitudes`: estructura para una etapa posterior.
- `/admin/configuracion`: vista de lectura de la configuración.

El panel requiere autenticación en el servidor y guarda configuración, cabañas y tarifas. El flujo público guarda solicitudes pendientes; el panel permite revisar y aceptar, rechazar o cancelar según las transiciones permitidas.

## Personalización

- `src/config/business.ts` y `src/modules/cabins/data.ts`: fixtures ficticios para la carga inicial, no fuente de datos de las páginas.
- Panel `/admin/configuracion`: identidad, logo, colores, contacto, textos, horarios y políticas persistidos.
- Panel `/admin/cabanas`: fichas, modalidad NIGHTLY o HOURLY, capacidad, servicios, imágenes, publicación y tarifas.
- `public/images/`: logo e ilustraciones SVG locales. También se pueden referenciar imágenes por URL HTTPS, sin proveedor de almacenamiento ni subida de archivos.
- `src/components/`: componentes compartidos y filtros del catálogo.
- `src/app/globals.css`: estilos responsive para móvil, tablet y escritorio.
- `src/lib/format.ts`: formato de precios CLP.

Los textos generales de la interfaz están junto a sus componentes; la identidad pública proviene de `BusinessSettings`. CSS y los metadatos usan esa configuración en cada petición.

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

## Consultar disponibilidad y solicitar una reserva

El detalle de cada cabaña publicada permite consultar un período y enviar una solicitud **PENDING**. Las fechas, capacidad, modalidad, disponibilidad y precio se validan en el servidor. Se reutilizan `estimateStay`, `createRequest` y el registro común de ocupación: solo `CONFIRMED` y los bloqueos manuales ocupan `[inicio, salida)`. Consultar y enviar una solicitud pendiente no bloquea el período.

Para probar localmente, iniciar PostgreSQL y el proyecto como antes; cargar `npm run db:seed:demo` si la instalación aún no tiene cabañas. Usar el mismo origen que `BETTER_AUTH_URL`, normalmente **http://localhost:3000**. No se requiere iniciar sesión para consultar o solicitar.

1. **Por noche:** abrir una cabaña NIGHTLY (`/cabanas/bosque` con fixtures sin renombrar), elegir llegada y salida futuras y cantidad de huéspedes. Consultar para ver entrada/salida según horarios del negocio, total CLP y desglose por noche.
2. **Por hora:** abrir una cabaña HOURLY (`/cabanas/rio` con fixtures sin renombrar), elegir fecha, hora de inicio en punto entre 0 y 23 y duración entera. El servidor convierte la hora local de Santiago a un instante y calcula la salida sumando horas efectivamente transcurridas. Rechaza horas ambiguas o inexistentes por cambios de horario.
3. En ambos casos, completar nombre y correo (teléfono opcional), aceptar expresamente que no es una confirmación y pulsar «Enviar solicitud pendiente». La respuesta muestra «Solicitud recibida» genérico, sin devolver datos del registro; el estimado consultado se conserva en la solicitud original. No se realiza cobro ni se envía notificación.
4. Consultar de nuevo el mismo intervalo seguirá siendo posible mientras solo haya solicitudes pendientes. Si se confirma una reserva o se agrega un bloqueo mediante los servicios internos, la consulta y el envío rechazan ese intervalo. La salida exclusiva permite períodos contiguos.

No se acepta un total calculado por el navegador. La consulta emite una firma temporal de cinco minutos ligada a cabaña, fechas/horas, huéspedes, precio y desglose. Al enviar, el servidor verifica la firma y recalcula todo dentro del servicio transaccional existente. Si cambia una tarifa, horario o selección, se exige consultar nuevamente, sin guardar una solicitud con otro precio silenciosamente. Cambiar la selección en pantalla también invalida el estimado visible. El total y desglose persistidos son la copia del servidor.

Abuso y privacidad: mismo origen, validaciones acotadas y campo trampa. Las cuotas actuales son 40 consultas y 5 intentos nuevos de envío por minuto **por visitante**, con cookie anónima firmada; ya no se aplica el límite público global anterior. Los envíos son idempotentes mediante una clave aleatoria persistida como huellas. Ver la sección de idempotencia y cuotas para garantías, migración y límites restantes.

La respuesta pública no incluye datos de huéspedes, identificadores de solicitud, cuentas ni calendario privado; solo el resultado de la consulta propia, precio/desglose y confirmación genérica. No existe un endpoint público para consultar una solicitud por ID o correo. Errores inesperados se convierten en un mensaje genérico sin registrar datos del formulario. El formulario no guarda datos personales en almacenamiento del navegador.

**Gestión administrativa:** el panel ya permite listar, filtrar y gestionar estados de solicitudes mediante los servicios existentes. El dueño deberá aceptar para que exista una reserva confirmada. No hay pagos, correos ni WhatsApp automáticos, ni garantía de retención del período. El máximo técnico por solicitud sigue siendo el del dominio existente: 366 noches o 8784 horas. La aceptación conserva su comprobación transaccional contra solapamientos.

La consulta y las reglas de disponibilidad conservan los modelos existentes; la idempotencia agrega solamente la tabla BookingSubmission en una quinta migración. Las pruebas siguen incluyendo solicitudes PENDING sin ocupación, confirmadas/bloqueos y precios calculados en servidor.

## Revisar solicitudes desde el panel

`/admin/solicitudes` muestra pendientes, confirmadas, rechazadas y canceladas desde PostgreSQL. Cada lectura, contador y acción verifica `requireAdmin()` en el servidor. La lista usa tarjetas, 20 registros por página y filtros GET por estado y período de estadía. «Desde» y «Hasta» incluyen los días locales de Santiago completos: se muestran las estadías que coinciden con cualquier parte del rango, respetando salida exclusiva. No se filtra por fecha de envío. Los filtros inválidos muestran un error y no ejecutan la consulta de solicitudes.

Al abrir un detalle se muestran cabaña, modalidad y período guardados, cantidad de personas, nombre/correo/teléfono y precio con desglose persistido. No se consultan tarifas actuales para reconstruirlo. Los registros heredados sin desglose reconocido conservan su total y muestran un aviso. No hay campos para editar precio, fechas, cantidad de personas o contacto.

Acciones disponibles:

- PENDING: **Confirmar solicitud** o **Rechazar solicitud**.
- CONFIRMED: **Cancelar reserva confirmada**, que libera la ocupación.
- REJECTED y CANCELLED: solo lectura, sin reabrir estados.

Las acciones delegan en `changeRequestStatus`, sin reimplementar disponibilidad. Confirmar vuelve a comprobar publicación, capacidad, inicio futuro y ocupación bajo el bloqueo transaccional existente. Si otro registro confirmado o bloqueo ocupa las fechas, aparece un error claro y la solicitud no se confirma. El precio y snapshot guardados nunca cambian. Cambiar una tarifa actual no modifica solicitudes anteriores. El resumen `/admin` muestra el total de pendientes y confirmadas de toda la instalación, con enlaces a sus filtros.

Para probar con datos ficticios, sin tocar una instalación productiva:

1. Iniciar PostgreSQL y el proyecto. Si falta catálogo de desarrollo, ejecutar `npm run db:seed:demo` (no crea solicitudes). Iniciar sesión en `/login` con la cuenta propia.
2. Desde el formulario público, enviar cuatro solicitudes con nombres claramente ficticios y correos `example.test`: A y B para la misma cabaña y período futuro; C y D para otros períodos. No superar los cinco intentos de envío por minuto del formulario.
3. En `/admin/solicitudes?status=PENDING`, abrir A y confirmarla. Abrir B e intentar confirmarla: debe indicar que las fechas dejaron de estar disponibles y conservar B pendiente. Rechazar B.
4. Confirmar C y luego cancelarla. Dejar D pendiente. Probar los cuatro filtros de estado y el rango de fechas; el resumen debe reflejar A confirmada y D pendiente. Consultar el período de C públicamente vuelve a estar permitido si no hay otra ocupación.
5. Modificar una tarifa actual y volver al detalle de A: el total y desglose guardados deben permanecer iguales. Sin sesión, la lista y los detalles deben redirigir a `/login`; publicar una cabaña no publica los contactos de sus solicitudes.

`npm run test:postgres` verifica estas operaciones por HTTP con una cuenta y datos efímeros en `cabanias_test`; conserva las pruebas anteriores de concurrencia y consulta pública. No se agregaron modelos, migraciones, dependencias ni datos de desarrollo. No se envían correos, WhatsApp, pagos ni reembolsos automáticos.

Móvil: tarjetas en una columna, filtros apilados, contacto con corte de líneas y controles de al menos 48 px; no hay tabla ancha que obligue a desplazamiento horizontal. Se revisó CSS/estructura y respuesta HTTP con agente móvil. La revisión visual y de interacción en navegadores/dispositivos queda para la etapa final.

## Envíos idempotentes y cuotas por visitante

La migración **`202611140005_booking_idempotency`** agrega `BookingSubmission`: huella de clave aleatoria, huella HMAC del contenido, vínculo único a la solicitud y fecha. Es necesaria para reconocer reintentos entre procesos, reinicios y envíos simultáneos. No cambia las reglas de ocupación, tarifas ni estados. **Se preparó y probó únicamente en `cabanias_test`; no está aplicada en desarrollo.** Para habilitar esta versión localmente, el dueño puede aplicar la migración con `npm run db:local:migrate` antes de usar el nuevo envío. No usar `db push` ni marcarla como aplicada manualmente.

Cada formulario recibe una clave UUID aleatoria sin datos personales. La clave no se almacena en claro: el registro guarda SHA-256 de la clave y HMAC del contenido usando la propia clave aleatoria como secreto, por lo que no permite probar correos o nombres sin conocerla. Estas huellas no dependen del secreto de autenticación y sobreviven a su rotación. La huella incluye cabaña/ruta, modalidad, fechas u horas, cantidad y contacto normalizados y aceptación; no incluye el estimado temporal ni totales arbitrarios del navegador, que nunca son fuente de precio.

Una transacción toma un advisory lock por clave, busca el registro y, solo para una clave nueva, valida cuota, estimado y disponibilidad y crea solicitud y registro juntos. La clave única es la garantía persistente adicional. Dos POST simultáneos con la misma clave crean una sola solicitud. La misma clave y contenido devuelven **«Solicitud recibida»** genérico, sin datos de huéspedes ni estado actual. Un contenido distinto se rechaza, sin revelar el original.

Los reintentos reconocidos se resuelven **antes de validar el vencimiento del estimado y antes de consumir cuota de envío**. Por eso siguen funcionando después de vencer el estimado, cambiar tarifas o agotarse la cuota. No crean otra solicitud ni alteran la original. La respuesta obtiene una clave nueva; pulsar **«Iniciar otra solicitud intencional»** reinicia el formulario con ella y exige consultar de nuevo. Recargar abre también un formulario nuevo; para reintentar exactamente un envío hay que conservar su clave y contenido. Dos claves nuevas pueden crear solicitudes distintas del mismo período mientras solo estén PENDING.

Identidad anónima del limitador: cookie **`cabanias.visitor`** aleatoria firmada, HTTP-only, SameSite=Lax, host-only y Secure en HTTPS, con vigencia de 30 días. Es una alternativa cuando no hay una IP confiable entregada por la plataforma; no autentica al huésped. No se leen `X-Forwarded-For` ni otras cabeceras IP. La clave en PostgreSQL es HMAC de la identidad, sin IP ni correo en claro. Las cuotas son **40 consultas y 5 intentos nuevos de envío por minuto por visitante**, en contadores separados y atómicos. Las validaciones de un intento de envío que llega al servicio también consumen cuota; los reintentos reconocidos no. Los campos estructuralmente inválidos pueden rechazarse antes de llegar al limitador de envíos.

No hay un límite global de emergencia ni un límite global normal para el formulario público. Un visitante que agota su cuota no consume la de otro. El límite de login administrativo es independiente y permanece igual.

Límites restantes: borrar/rechazar cookies, cambiar de navegador o automatizar identidades nuevas permite obtener otro cupo anónimo; la cookie firmada evita falsificar identidades pero no demuestra que sean personas distintas. No se promete mitigación de DDoS o ataques distribuidos: quedan para una integración futura con proxy/IP realmente confiables o protección perimetral. No hay CAPTCHA ni servicio externo. Las filas de cuotas inactivas requieren una política de limpieza futura; los registros idempotentes no vencen ni se eliminan automáticamente, porque borrarlos perdería la garantía de reconocimiento. No borrar huellas para «desbloquear» un reintento. La solicitud asociada queda protegida por su FK; una futura política de eliminación de datos deberá tratar esta relación explícitamente.

Pruebas reproducibles: `npm run test:postgres` crea únicamente la base desechable, aplica cinco migraciones y prueba cookies separadas, cuotas atómicas, envío/reintento con estimado vencido, rechazo de contenido cambiado, concurrencia y claves intencionales nuevas. No ejecutar experimentos de reenvío sobre datos reales. Para una prueba manual tras aplicar la migración local por cuenta propia, usar ventanas normales e incógnitas como visitantes separados y nombres/correos ficticios; repetir un POST debe mantener la misma clave, no crear un formulario nuevo.

## Reglas existentes sin cambios

- Instalación y base de datos separadas por negocio.
- Zona horaria `America/Santiago`; moneda `CLP`.
- Una sola modalidad de arriendo por cabaña.
- Las solicitudes pendientes no bloquean disponibilidad.
- El dueño acepta o rechaza; al aceptar se debe comprobar disponibilidad nuevamente, incluyendo operaciones concurrentes.
- Política de cancelación como texto editable; sin reembolsos automáticos.

Las pantallas de catálogo y configuración están conectadas a PostgreSQL. Los datos ficticios solo se cargan mediante el comando explícito de desarrollo. Se consulta disponibilidad y se guardan solicitudes pendientes, sin confirmación automática, pagos ni notificaciones.

## Cargar y administrar el catálogo de desarrollo

La migración nueva `202611140004_development_seed` agrega únicamente la marca de carga demo. Conserva las tres migraciones anteriores y todas sus restricciones. Ya está aplicada en la base local de desarrollo; no se cargaron datos demo en esa base durante esta etapa.

```sh
npm run db:local:up
npm run db:local:migrate
npm run db:seed:demo
```

`db:seed:demo` es manual, solo admite `127.0.0.1:54329/cabanias_dev` y rechaza `NODE_ENV=production`. No está vinculado a instalación, arranque ni despliegue. En su primera ejecución crea solo lo que falta: configuración ficticia, tres cabañas publicadas, imágenes y servicios, más una temporada ficticia por cabaña. No crea usuarios ni reservas. Respeta configuración y cabañas existentes; una marca transaccional impide que ejecuciones posteriores sobrescriban ediciones, dupliquen una cabaña renombrada o restauren una eliminada. No borrar esa marca para volver a cargar datos en una base editada.

Sin configuración, la portada muestra «Sitio en preparación»; sin cabañas publicadas, el catálogo muestra su estado vacío. No se sustituyen silenciosamente los datos de PostgreSQL por fixtures. Si PostgreSQL falla, se muestra un error de carga y opción de reintento.

Para entrar, seguir la creación de cuenta descrita más abajo si todavía no existe, ejecutar `npm run dev` y abrir **http://localhost:3000/login**. El correo público de contacto es independiente del correo de acceso.

Para comprobar la conexión:

1. En `/admin/configuracion`, cambiar nombre, colores, textos, contacto, horarios o política y guardar.
2. Abrir o recargar `/`: encabezado, colores, textos y pie deben mostrar los valores guardados. La política y horarios aparecen también en los detalles correspondientes.
3. En `/admin/cabanas`, crear una ficha o editar una existente: capacidad, modalidad, descripción, servicios y tarifa base. Guardar en borrador para mantenerla oculta.
4. Agregar imágenes, publicar y abrir `/cabanas` y `/cabanas/<ruta>`. Agregar o editar una temporada desde la ficha administrativa; su precio y fechas aparecen en el detalle público. Las temporadas superpuestas se rechazan sin guardar cambios parciales.
5. Despublicar: desaparece del catálogo y su URL pública devuelve 404. Publicar otra vez la hace visible. Para eliminar, marcar la confirmación; una cabaña con historial de solicitudes o bloqueos no puede eliminarse y debe despublicarse.

Las lecturas son dinámicas y las acciones revalidan el layout: los cambios se ven en una nueva visita o recarga pública, sin recompilar ni reiniciar. Una pestaña que ya estaba abierta no se actualiza en tiempo real.

Imágenes: cada línea del editor usa `URL | texto alternativo`, hasta diez líneas. El orden determina la galería y la primera imagen es portada. Se aceptan `/images/...`, URL HTTPS, y HTTP únicamente en loopback de desarrollo. Servicios: uno por línea, hasta treinta. Para publicar es obligatoria al menos una imagen. No hay subida, descarga al servidor, optimización, eliminación de archivos ni proveedor externo de almacenamiento; la URL debe seguir disponible. Reemplazar una referencia no borra el archivo. No usar URL con credenciales.

Pruebas: `npm run test:postgres` ahora también envía formularios reales a las acciones de servidor, revisa cambios públicos, ocultación por estado, validaciones, tarifas e idempotencia demo, todo en `cabanias_test` desechable. Los cambios de estas pruebas no afectan desarrollo. No se probó navegación visual con un navegador; las comprobaciones son HTTP y PostgreSQL.

## Calendario y bloqueos manuales

Entrar con la cuenta administradora y abrir **`/admin/calendario`** desde la navegación. La página, el selector, las consultas de eventos y cada acción están protegidos por `requireAdmin()` en el servidor. No muestra contactos de huéspedes: las solicitudes enlazan a sus detalles protegidos.

- Elegir una cabaña y fecha de referencia. Se incluyen también cabañas sin publicar, para administrar su mantenimiento.
- NIGHTLY: mes de la fecha seleccionada, con navegación por meses. En escritorio aparece la cuadrícula; por debajo de 1100 px se sustituye por una agenda de días con eventos.
- HOURLY: agenda del día, con navegación diaria e intervalos ordenados por inicio.
- Verde: **Reserva confirmada · ocupado**. Rojo: **Bloqueo manual · ocupado**. Amarillo y borde discontinuo: **Solicitud pendiente · no ocupa**. Las etiquetas textuales evitan depender únicamente del color.

Los eventos conservan su intervalo completo, incluida su salida exclusiva y offset UTC de Santiago. Un evento que cruza días aparece en cada día con el que se solapa; el día de salida puede tener ocupación solo hasta la hora indicada. La cuadrícula no significa que toda esa fecha esté ocupada. Los cambios de horario se interpretan con `America/Santiago`, sin asumir días de 24 horas.

Para crear un bloqueo, completar **inicio incluido, salida excluida y motivo** en el formulario inferior. Son horas locales de Santiago con precisión de minutos, también para cabañas por noche; no se redondean a noches ni se toma una tarifa. Se rechazan intervalos invertidos y horas locales ambiguas o inexistentes. La acción usa `createManualBlock`, que comprueba disponibilidad con las reglas y transacción existentes. Un conflicto muestra un error comprensible y no crea el bloqueo.

Para eliminar, buscarlo en «Bloqueos del período», marcar su confirmación y pulsar eliminar. Usa `removeManualBlock`, que libera la ocupación mediante los triggers actuales. No se escribe directamente en `Occupancy`, ni se cambian reservas, estados o precios desde el calendario. No hay edición de bloqueos: para modificar uno se elimina y crea otro, validando nuevamente disponibilidad.

Cómo probar con datos ficticios:

1. Crear un bloqueo en un intervalo futuro sin ocupación: debe aparecer como bloqueo ocupado. La consulta pública de un período que lo cruce debe rechazarlo.
2. Intentar otro bloqueo sobre ese mismo intervalo: debe rechazarse. Eliminar el primero y consultar nuevamente debe permitir el período, salvo que exista otra ocupación.
3. Enviar una solicitud pública ficticia, dejarla pendiente y abrir su fecha en el calendario. Debe mostrarse como aviso «no ocupa». Crear un bloqueo sobre ese intervalo es válido; la solicitud debe conservar su estado y precio. Mientras exista ese bloqueo no podrá confirmarse.
4. Para probar el choque con una reserva, enviar otra solicitud en un período distinto y confirmarla desde `/admin/solicitudes`. Intentar bloquear ese intervalo debe fallar sin modificar la reserva. Un bloqueo que comienza exactamente en la salida excluida puede crearse.

Límites: vista informativa sin actualización en tiempo real; recargar para ver cambios de otras pestañas. Se muestran hasta **500 solicitudes y 500 bloqueos por período**, con aviso explícito si la vista queda parcial; crear bloqueos siempre comprueba todos los registros. No se deben inferir huecos libres a partir de una vista truncada. No hay arrastrar/soltar, exportación, edición de reservas ni pagos o notificaciones. Se verificaron HTTP, datos y reglas; la revisión visual completa de navegadores sigue pendiente.

## Acceso a la cuenta administradora

Better Auth 1.7.23 gestiona el hash scrypt, las sesiones persistentes y las cookies. Su adaptador declara compatibilidad con Prisma 7, Next.js 16 y React 19. No hay registro público, cuentas predeterminadas ni cuentas creadas automáticamente en desarrollo.

Para crear tu cuenta inicial local, desde una terminal interactiva en la raíz:

```sh
npm run db:local:up
npm run auth:setup
npm run db:local:migrate
npm run admin:create
npm run dev
```

`auth:setup` genera un secreto aleatorio en `.env` sin mostrarlo y conserva el secreto existente. Configura `BETTER_AUTH_URL=http://localhost:3000` para desarrollo. `admin:create` solicita tu correo, nombre y contraseña (12–128 caracteres), con confirmación y entrada oculta. No acepta contraseñas por argumentos ni pipes. El comando solo permite la base local de desarrollo; no crea cuentas en producción. La contraseña pasa directamente a Better Auth y solo se guarda su hash en `Account.password`; no se escribe en archivos o registros. No hay contraseña de demostración.

Abre **http://localhost:3000/login** e ingresa el correo y la contraseña que elegiste. Usa el mismo host que `BETTER_AUTH_URL` (no alternes `localhost` y `127.0.0.1`). Si ya tenías el servidor abierto antes de `auth:setup`, reinícialo para cargar las variables. La cuenta inicial no se reemplaza al volver a ejecutar el comando. Una columna singleton con CHECK y UNIQUE impide una segunda cuenta incluso ante creación simultánea.

El layout, cada página administrativa y la acción de cierre de sesión llaman a `requireAdmin()` en el servidor. Este consulta la sesión persistida y comprueba que la cuenta siga activa; no se autoriza por presencia de una cookie ni por ocultar enlaces. Las próximas acciones administrativas deben llamar al mismo guard antes de leer o modificar datos. Las rutas HTTP de Better Auth se limitan a inicio, cierre y consulta de sesión: los endpoints de registro y administración de cuentas devuelven 404.

Cookies HTTP-only, SameSite=Lax, sin dominio compartido y Secure cuando el origen es HTTPS. HTTP se permite únicamente para loopback local; cualquier otro origen exige HTTPS. En producción configurar explícitamente `BETTER_AUTH_URL` con el origen HTTPS y `BETTER_AUTH_SECRET` aleatorio de al menos 32 caracteres mediante secretos del despliegue, sin `NEXT_PUBLIC_`. Mantener un único origen de confianza y HTTPS en el proxy. Las sesiones vencen a las ocho horas y se consultan en base de datos sin caché de cookie; cerrar sesión revoca el token, incluido su replay. El limitador de intentos usa PostgreSQL: cinco intentos de inicio por minuto compartidos por esta instalación de cuenta única. El handler sustituye la cabecera interna usada para el bucket; cambiar cabeceras IP de proxy no permite evitar este límite.

La migración `202611140003_admin_auth` agrega las tablas de Better Auth y migra el modelo `Administrator` aún vacío. Se detiene si encuentra una cuenta heredada para no descartar su hash silenciosamente. No modifica las migraciones ni las reglas de reservas anteriores.

`npm run test:postgres` incluye pruebas HTTP reales contra un servidor de pruebas en `127.0.0.1:3101`, con compilación separada en `.local/next-auth-test` y la base desechable. Genera una contraseña efímera en memoria, nunca la muestra y elimina la cuenta con la base de pruebas. Verifica accesos directos, cookie inválida, sesión válida, registro bloqueado, CSRF, cuenta inactiva, acción sin sesión y revocación. No crea una cuenta en `cabanias_dev`.

Referencias: [integración oficial de Better Auth con Next.js](https://better-auth.com/docs/integrations/next), [adaptador Prisma](https://better-auth.com/docs/adapters/prisma) y [cookies](https://better-auth.com/docs/concepts/cookies).
