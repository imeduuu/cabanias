## Etapa 16: correcciones responsive y accesibilidad (23 de noviembre de 2026)

Se corrigen los contrastes detectados con los colores de `BusinessSettings`, los nombres visibles de los enlaces a cabañas, la jerarquía de encabezados y el landmark inferior del panel. Los enlaces y controles dedicados reciben áreas táctiles de al menos 44 px; los campos de texto con valores largos muestran una fila adicional en móvil. Se agrega una prueba Playwright con axe para las 16 rutas públicas y administrativas a 360, 768 y 1280 px, que falla ante violaciones serias o críticas. El informe conserva la medición inicial y agrega el resultado posterior.

Archivos: `src/app/globals.css`, `src/app/admin/layout.tsx`, `src/components/admin-fields.tsx`, `src/components/cabin-card.tsx`, `src/components/catalog.tsx`, `tests/e2e/accessibility.spec.ts`, ajuste de tipado en `tests/e2e/admin-panel.spec.ts`, `package.json`, `package-lock.json`, `artifacts/a11y-audit/report.md` y capturas del informe.

Verificaciones: `npm test` aprobó 11 pruebas; `npm run typecheck` correcto; `next build` correcto en copia temporal sin `.env` ni `.local/`; la prueba E2E axe aprobó las 48 combinaciones de ruta y viewport. El análisis completo posterior reportó cero violaciones axe de cualquier nivel, cero desbordes horizontales, cero textos recortados, cero controles sin nombre y cero áreas de texto que requieran desplazamiento. `npm run lint` terminó sin errores y conserva ocho advertencias de imágenes y navegación.

Límites: se usó el fixture E2E con los colores predeterminados de `BusinessSettings`. No se modificaron acciones, autenticación, persistencia ni reglas de dominio. La solicitud de prueba y el administrador vivieron solo en el contenedor temporal `cabanias_test`, eliminado al terminar.
# Archivos y verificaciones

## Etapa 15: flujos E2E del panel administrativo (23 de noviembre de 2026)

Se amplía Playwright con siete escenarios del panel usando la cuenta efímera y PostgreSQL aislado: protección de rutas sin sesión, inicio/recarga/cierre de sesión, confirmación concurrente de solicitudes A y B, cancelación y disponibilidad restaurada, creación/consulta/eliminación de bloqueos, actualización del nombre público y ciclo de borrador/publicación con imagen. La suite administrativa autentica una vez en Chromium de escritorio; los siete escenarios se omiten en móvil para respetar el límite de intentos de acceso de la cuenta temporal. Las pruebas públicas existentes continúan ejecutándose en escritorio y móvil.

Archivos: `tests/e2e/admin-panel.spec.ts`, `playwright.config.ts`, `IMPLEMENTACION.md`.

Verificaciones: `npm run test:e2e` aprobó 21 pruebas y omitió los siete escenarios administrativos en móvil; cubrió todos los siete en escritorio y las siete pruebas públicas en ambos perfiles. `npm test` aprobó 11 pruebas, `npm run typecheck` y `npm run build` terminaron correctamente, y `npm run test:postgres` aprobó 21 pruebas en `cabanias_test`.

Límites: solicitudes, configuración, cabaña, bloqueo y administrador existen solo en `cabanias_test` efímera. Los intervalos E2E son fijos en 2030 y se separan por perfil.

## Etapa 14: flujo público de solicitudes E2E (23 de noviembre de 2026)

Se amplían las pruebas Playwright del flujo público para cubrir cotización y solicitud NIGHTLY, consulta HOURLY, exceso de capacidad, bloqueo manual, invalidación del estimado al cambiar la selección y reinicio intencional del formulario. Los datos de contacto usan un nombre ficticio y `@example.test`. El fixture crea un bloqueo sobre Refugio Bosque; el trigger SQL existente mantiene su ocupación sincronizada.

Archivos: `scripts/seed-e2e.ts`, `tests/e2e/public-pages.spec.ts`, `IMPLEMENTACION.md`.

Verificaciones: `npm run test:e2e` aprobó las 14 ejecuciones de escritorio y móvil (siete escenarios en cada perfil); `npm test` aprobó 11 pruebas; `npm run typecheck` y `npm run build` finalizaron correctamente.

Límites: el bloqueo y la solicitud solo se cargan en `cabanias_test`, dentro del flujo E2E aislado; el período E2E es fijo en 2030.

## Etapa 13: pruebas E2E con Playwright (22 de noviembre de 2026)

Se agrega `npm run test:e2e` como flujo aislado para verificar las páginas públicas en Chromium de escritorio (1280 px) y móvil (360 px). `scripts/local-db.mjs` recrea únicamente el servicio `postgres-test`, verifica su identidad, despliega migraciones, carga un fixture E2E separado y levanta Next en `127.0.0.1:3102`. El build usa `.local/next-e2e` y se elimina junto con el servidor y el contenedor al finalizar, incluso ante fallos.

`scripts/seed-e2e.ts` valida `TEST_DATABASE_URL` contra `cabanias_test`, carga las tres cabañas ficticias y crea un administrador aleatorio. Su contraseña y el secreto de autenticación viven solo en variables de entorno del proceso; el fixture no llama `db:seed:demo` ni relaja su protección de `cabanias_dev`. `tests/e2e/public-pages.spec.ts` verifica portada, catálogo, los tres detalles y errores de consola/página.

Archivos: `package.json`, `package-lock.json`, `next.config.ts`, `playwright.config.ts`, `scripts/local-db.mjs`, `scripts/seed-e2e.ts`, `tests/e2e/public-pages.spec.ts`, README e IMPLEMENTACION.

Verificaciones: `npm run test:e2e` aprobó las dos pruebas, Chromium escritorio y móvil; las páginas públicas cargaron sin errores de consola ni de ejecución. `npm test` aprobó 11 pruebas; `npm run typecheck` y `npm run build` finalizaron correctamente. `npm run test:postgres` aplicó las cinco migraciones en `cabanias_test` y aprobó 21 pruebas; el contenedor se eliminó al terminar. `npm run lint` terminó sin errores y con ocho advertencias preexistentes de `<img>` y `window.location.assign()`. `git diff --check` no encontró errores de espacios.

Límites: requiere Docker, variables locales válidas para `cabanias_test` y Chromium instalado con `npx playwright install chromium`. La cuenta y los datos solo existen en la base desechable; no se toca `cabanias_dev`.

## Etapa 12: CI con PostgreSQL efímero (22 de noviembre de 2026)

Se agregó GitHub Actions para pull requests y push a `main`, con Node 22 y caché npm. `check` ejecuta `npm ci` y `npm run check` con una URL PostgreSQL ficticia que no se conecta. `postgres` crea contraseñas y secreto de autenticación aleatorios en `RUNNER_TEMP`, configura un override temporal de Compose y ejecuta `npm run test:postgres`.

Archivos: `.github/workflows/ci.yml`, `scripts/local-db.mjs`, `scripts/auth-setup.mjs`, `README.md` e `IMPLEMENTACION.md`. El modo CI evita leer `.env` y los archivos `.local/`; las URL continúan restringidas por `assertLocalUrl` a 127.0.0.1 y sus puertos/bases autorizados. La identidad del servidor y del contenedor se comprueba igual que en local. Las contraseñas no se escriben en logs. El badge de Actions se agregó al README.

Verificaciones: `npm test` (11 aprobadas), `npm run typecheck` y `npm run check` correctos; este último también completó lint sin errores (ocho avisos existentes), validación Prisma y build. `npm run auth:setup` en CI validó el secreto sin escribir archivos. `npm run test:postgres` en modo CI aplicó cinco migraciones y aprobó 21 pruebas en `cabanias_test`; identidad de servidor y contenedor verificadas y servicio eliminado. `actionlint` no está instalado en el entorno, así que no se pudo ejecutar.

Límites: se conserva el rechazo de destinos remotos y el servicio PostgreSQL de pruebas efímero sobre `127.0.0.1:54330/cabanias_test`; no se inicia ni escribe en la base de desarrollo.

## Etapa 11: ESLint y chequeo integrado (22 de noviembre de 2026)

Se configura ESLint mediante la CLI compatible con Next.js 16; `next lint` ya no existe. La guía instalada recomienda `eslint` y `eslint-config-next`, con `core-web-vitals` y `typescript` en la configuración flat. Se instalaron `eslint@^10.15.0` y `eslint-config-next@^16.4.6` como dependencias de desarrollo.

Archivos modificados: `eslint.config.mjs` usa la configuración oficial y excluye `.next`, `.local`, `src/generated` y `node_modules` (además de las salidas estándar de Next). `package.json` agrega `lint` y `check`; README documenta ambos comandos. `tests/auth.test.ts` cambia una variable no reasignada de `let` a `const`, sin alterar el comportamiento.

Verificaciones: `npm run check` completo; ESLint terminó con cero errores y ocho advertencias existentes por `<img>` y `window.location.assign()`. Se conservaron esas implementaciones para evitar cambios de comportamiento. Typecheck, 11 pruebas, validación Prisma y build terminaron correctamente. npm informó tres vulnerabilidades altas en el árbol instalado; no se aplicó una actualización forzada de dependencias. No se modificaron reglas de dominio ni bases de datos.

## Etapa 10: reglas de trabajo para Claude (22 de noviembre de 2026)

Se creó `CLAUDE.md` en la raíz con `@AGENTS.md` como primera línea para cargar las reglas de Next.js existentes. La sección «Reglas de trabajo» fija las restricciones de Git, bases de datos, secretos, dependencias y dominio, además de las verificaciones y documentación requeridas al cerrar cada tarea. Se agregó `CLAUDE.md` a `.gitignore`, según lo solicitado.

Archivos: `CLAUDE.md`, `.gitignore` e `IMPLEMENTACION.md`. No cambió el uso de la aplicación; README sin cambios.

Verificaciones: `npm test` (11 aprobadas), `npm run typecheck` y `npm run build` finalizaron correctamente. No se ejecutó `npm run test:postgres` porque no se tocaron base de datos, acciones ni autenticación.

Límites: no se modificó código de aplicación, esquema, migraciones, acciones ni autenticación; no se accedió a archivos de entorno ni a bases de datos.

## Etapa 9: idempotencia y cuotas por visitante (14 de noviembre de 2026)

Se sustituyó el límite público compartido de 40 consultas / 5 envíos por cuotas independientes por visitante, y se agregó reconocimiento persistente de envíos. Las pruebas y migraciones de esta etapa se ejecutaron **solo en `cabanias_test` desechable**. No se aplicó la quinta migración en desarrollo ni se modificaron sus registros.

Diseño y archivos:

- `prisma/schema.prisma` y `prisma/migrations/202611140005_booking_idempotency/migration.sql`: nuevo BookingSubmission con keyHash único, payloadHash HMAC, requestId único/FK y createdAt. Esta migración se explicó antes de crearla: la garantía requiere persistencia y atomicidad entre solicitud y registro. No modifica estados, tarifas ni reglas de ocupación.
- `src/modules/bookings/submission-key.ts`: valida UUID v4, guarda SHA-256 de la clave aleatoria y HMAC del contenido con esa clave como secreto no persistido. No guarda la clave cruda ni datos de contacto en el registro idempotente; no depende de rotar el secreto de autenticación.
- `src/modules/bookings/visitor.ts`: identidad anónima aleatoria firmada, cookie HTTP-only/SameSite=Lax/Secure en HTTPS, treinta días. Solo su HMAC se usa como clave de cuotas; no se leen cabeceras IP ni correos.
- `src/modules/bookings/public-limit.ts`: cuotas por visitante y operación en RateLimit, con incrementos atómicos. 40 consultas y 5 intentos nuevos por minuto; se retiran las claves globales del flujo público. No se agrega límite global de emergencia.
- `src/modules/bookings/service.ts`: cuerpo original de creación extraído a persistRequest sin cambiar sus reglas; createRequest conserva su API. createIdempotentRequest usa transacción ReadCommitted, advisory lock por huella de clave, reconocimiento previo a cuota/estimado, creación conjunta y restricciones únicas. Los rechazos de dominio previos a la inserción conservan el contador de intentos; errores SQL revierten solicitud y registro juntos.
- Acción pública: normaliza contenido relevante sin incluir precio arbitrario ni token temporal; rechaza reutilización con contenido distinto. Un reintento reconocido evita validación del estimado vencido y consumo de cuota. La respuesta es genérica y no revela precio, estado actual, identidad o ID de la solicitud.
- Detalle público y BookingForm: clave aleatoria inicial del servidor, campo oculto y clave siguiente en éxito. «Iniciar otra solicitud intencional» reinicia el formulario con una clave nueva y nueva consulta. El remonte de React usa una generación estable para conservar Server Actions con POST nativo.
- `tests/auth.test.ts`: cookie jar anónimo, visitante B independiente, reintento con estimado firmado vencido, contenido distinto, dos POST simultáneos, nueva intención y privacidad. El analizador de formularios se cambió a un recorrido lineal.
- `tests/postgres.test.ts`: cuotas concurrentes atómicas, aislamiento de visitantes y separación entre consulta/envío. README y este registro documentan operación y límites. Sin dependencias nuevas.

Verificaciones:

- Revisión previa de README, IMPLEMENTACION, limitador global existente e instrucciones/guía Next instalada.
- `npx prisma format`, `npm run db:generate`; migración generada offline con diff entre esquemas. No se ejecutó `db:local:migrate` ni se escribió en la base de desarrollo.
- `npm run test:postgres`: cinco migraciones desde cero en la base desechable; **21 pruebas aprobadas, cero fallos y cero omisiones**. Contenedor eliminado al finalizar. Se mantuvieron las pruebas de autenticación, catálogo, calendario, estados, precios y concurrencia de reservas.
- Visitante A agotó envíos; B recibió cookie independiente y envió normalmente. En PostgreSQL, 41 consultas concurrentes de A produjeron 40 éxitos y un rechazo, sin consumir sus cinco envíos ni los cupos de B.
- Mismo envío con clave original y estimado vencido: éxito genérico y contador de solicitudes sin cambios. Contenido distinto: rechazo sin correo en la respuesta. Dos POST simultáneos con clave igual: ambos exitosos y solo una nueva fila. Dos claves intencionales nuevas: solicitudes distintas del mismo período, todas PENDING.
- Inspección de claves persistidas: prefijo de operación y HMAC hexadecimal, sin IP o correo. Las respuestas mantienen la privacidad y los reintentos no recalculan ni alteran la solicitud existente.
- `npm run typecheck`, `npm run build` y `npm run db:validate`: correctos.

Incidencias corregidas durante QA: una expresión regular del arnés podía consumir CPU al no encontrar un formulario dentro de HTML/Flight; se sustituyó por un escaneo lineal y se terminó únicamente el árbol de procesos de esa prueba. La nueva envoltura del formulario necesitó mantener estable su keyPath React para conservar el estimado tras un POST nativo. Después de corregirlo pasó la suite completa. No fue necesario alterar reglas o datos de desarrollo.

Límites: la identidad anónima puede renovarse borrando/rechazando cookies o usando otro navegador, de modo que no resuelve ataques distribuidos ni identifica personas físicas. No hay IP confiable configurada, protección perimetral, CAPTCHA o servicio externo. Los contadores inactivos necesitan una política de limpieza futura. El registro idempotente no vence y su FK protege la solicitud: una futura política de eliminación debe preservar o tratar explícitamente esa garantía. Un formulario recargado es una intención nueva; conservar clave/contenido es necesario para reintentar exactamente el envío anterior. La revisión completa de navegadores sigue pendiente.

Activación local pendiente por instrucción de no modificar desarrollo: el dueño puede ejecutar `npm run db:local:migrate` para aplicar `202611140005_booking_idempotency` cuando corresponda. La migración está lista y solo se verificó ejecutada en pruebas; nunca se marcó como aplicada en desarrollo.

## Etapa 8: calendario y bloqueos manuales (14 de noviembre de 2026)

Se agregó `/admin/calendario` con selector de cabaña, fecha y navegación. NIGHTLY usa mes en escritorio y agenda legible bajo 1100 px; HOURLY usa agenda diaria. Las reservas CONFIRMED y bloqueos se etiquetan como ocupados; PENDING es un aviso distinto que no ocupa. Se conservan salida exclusiva y zona America/Santiago, incluidas transiciones DST y offsets de los eventos.

Archivos nuevos:

- `src/modules/bookings/calendar.ts`: ventanas de calendario por mes/día, intervalos locales de bloqueo y presentación de instantes con offset. Rechaza horas ambiguas/inexistentes; los días pueden durar 23 o 25 horas. Mantiene segundos/milisegundos al mostrar eventos que los tengan.
- `src/lib/calendar-data.ts`: selección y lectura protegidas con `requireAdmin()`; solicita únicamente campos necesarios de CONFIRMED, PENDING y ManualBlock. Consulta solapamiento `[inicio, fin)` y no lee ni escribe directamente la proyección Occupancy.
- `src/app/admin/calendario/page.tsx`: cuadrícula mensual, agenda diaria/móvil, etiquetas y motivos, formulario de bloqueo y eliminación con confirmación. Las solicitudes enlazan al detalle protegido; no se editan reservas o tarifas.
- `src/app/admin/calendario/actions.ts`: guard inicial, validación de intervalo/motivo/identificadores, comprobación de pertenencia al eliminar y uso exclusivo de `createManualBlock` / `removeManualBlock` para las mutaciones. Conflictos devuelven mensaje claro y no alteran reservas.

Archivos modificados: `src/components/admin-nav.tsx` agrega Calendario; `src/app/globals.css` agrega adaptación responsive y etiquetas que no dependen solo del color; `tests/auth.test.ts` y `tests/domain.test.ts` amplían las verificaciones; README y este registro documentan uso y límites.

No se modificaron modelos, migraciones, dependencias ni servicios de reserva existentes. Los triggers siguen siendo los únicos que sincronizan Occupancy. No se introdujeron pagos o mensajes automáticos. Los cambios de bloqueos de pruebas se hicieron solo en la base desechable.

Verificaciones:

- Revisión de AGENTS, README, IMPLEMENTACION y guía instalada de Next Server Actions antes de implementar.
- `npm test`: **11 pruebas puras aprobadas**, incluyendo mes bisiesto, navegación, día DST de 23 horas, intervalos inválidos y contigüidad con salida exclusiva.
- `npm run test:postgres`: **20 pruebas aprobadas, cero fallos y cero omisiones**, con las cuatro migraciones existentes aplicadas desde cero en `cabanias_test`. El contenedor de pruebas se eliminó después.
- HTTP: acceso al calendario sin sesión rechazado; crear y eliminar sin sesión no modifican bloques. Agenda HOURLY muestra confirmadas y pendientes con etiquetas distintas; NIGHTLY incluye cuadrícula y agenda responsive.
- Bloqueo sobre confirmada rechazado; sobre otro bloqueo rechazado; bloqueo contiguo a salida exclusiva aceptado. Un bloqueo sobre solicitud solo pendiente se crea y conserva su estado y snapshot; consulta de disponibilidad lo rechaza mientras existe y vuelve a aceptar tras eliminarlo.
- Respuesta con agente móvil comprobada y revisión estática de CSS/HTML: agenda en lugar de cuadrícula estrecha, formularios apilados bajo 700 px y controles amplios. No sustituye una inspección visual con navegador.
- `npm run typecheck`, `npm run build` y `npm run db:validate`: correctos.

Uso: elegir cabaña y fecha, indicar inicio/salida locales exactos y motivo, crear. Para comprobar choque, confirmar una solicitud ficticia en otro período e intentar bloquearlo. Para comprobar PENDING, dejar otra solicitud pendiente y observar su aviso sin ocupación; puede bloquearse manualmente. Ver README para pasos completos.

Límites: hasta 500 solicitudes y 500 bloqueos por período con aviso de vista parcial; las comprobaciones al crear siempre consideran todo. No hay actualización en tiempo real, edición de bloqueos, arrastrar/soltar o exportación. Los eventos que cruzan días se repiten en los días intersectados y no representan ocupación de la fecha completa. Las horas ambiguas por DST se rechazan al introducir bloqueos; pueden elegirse límites inequívocos que abarquen esa transición. La revisión completa de navegadores queda para la etapa final.

## Etapa 7: gestión administrativa de solicitudes (14 de noviembre de 2026)

Estado actual: `/admin/solicitudes` y sus detalles leen PostgreSQL y permiten confirmar pendientes, rechazar pendientes y cancelar confirmadas. Se reutiliza `changeRequestStatus` sin modificar su implementación, las reglas de ocupación, el flujo público, los modelos o las migraciones. No hay pagos ni notificaciones.

Archivos modificados o nuevos:

- `src/lib/admin-data.ts`: consultas protegidas de lista paginada, detalle y contadores por estado. Cada función verifica `requireAdmin()` antes de consultar PostgreSQL. La lista selecciona solo lo necesario; el contacto y snapshot se leen en el detalle protegido.
- `src/modules/bookings/admin-view.ts`: etiquetas de estado, validación de filtros, conversión de días completos en Santiago y presentación del desglose guardado. Los filtros incluyen estadías que intersectan el rango, con día final incluido y salida exclusiva; no usan fecha de envío. Fechas inválidas o parámetros duplicados se rechazan.
- `src/app/admin/solicitudes/page.tsx`: lista de tarjetas, estados, filtros GET y paginación de 20 filas. Estados vacíos y errores comprensibles.
- `src/app/admin/solicitudes/[id]/page.tsx`: detalle de solo lectura con cabaña, modalidad, período, huéspedes, contacto, total y desglose guardados. No recalcula con precios actuales ni permite editar condiciones. Muestra aviso si un snapshot heredado no tiene formato reconocido.
- `src/app/admin/solicitudes/actions.ts`: guard inicial, validación de ID y operación, comprobación de estado de origen y llamada al servicio existente. Solo transmite el estado; campos adicionales de precio o fechas se ignoran. Error específico si el período dejó de estar disponible; revalidación administrativa y redirección después de éxito.
- `src/app/admin/page.tsx`: cantidades persistentes de pendientes y confirmadas, sin filtro temporal, con enlaces a sus listas.
- `src/app/globals.css`: tarjetas de dos columnas en escritorio y una en móvil/tablet, filtros apilados, texto largo ajustable y controles amplios.
- `tests/auth.test.ts`: recorrido HTTP de las nuevas páginas y acciones, con datos ficticios aislados.
- `tests/domain.test.ts`: filtros por día durante el cambio de horario de Santiago y agrupación de unidades del snapshot sin usar tarifas actuales.
- README y este registro: operación y límites actualizados.

Verificaciones realizadas:

- Revisión previa de AGENTS, README, IMPLEMENTACION, consultas, servicio de estados y guía instalada de Next Server Actions.
- `npm run test:postgres`: suite existente ampliada, **17 pruebas aprobadas, cero fallos y cero omisiones**, con cuatro migraciones desde cero y fixtures efímeros en `cabanias_test`. No se modificaron solicitudes de desarrollo.
- HTTP autenticado: confirmación correcta, rechazo, cancelación y liberación de Occupancy; segundo intento de confirmación de período ocupado devuelve mensaje claro y conserva PENDING; transición inválida rechazada.
- Lista y filtros por los cuatro estados, fechas de estadía, error de rango invertido y contadores del resumen verificados. Precio total y snapshot permanecen idénticos aunque cambie la tarifa de la cabaña o el POST incluya campos de precio/fechas manipulados.
- Detalle y acción sin sesión rechazados; cookie falsa no permite entrar. El detalle público de la misma cabaña no contiene nombre, correo o ID de solicitud.
- Respuesta HTTP de lista con agente móvil correcta. Revisión de CSS y HTML: sin tabla ancha, tarjetas en una columna bajo 1000 px, filtros en una bajo 700 px, contacto con corte de líneas y botones de 48 px como mínimo. Esto no equivale a una prueba visual real en navegador.
- `npm test`: **10 pruebas puras aprobadas**, incluidas dos nuevas pruebas de filtros DST y desglose guardado añadidas tras el recorrido de integración.
- `npm run typecheck`, `npm run build` y `npm run db:validate`: correctos. Se corrigieron tipos explícitos de dos variables usados por closures; sin cambios de lógica o dominio.

Para probar manualmente con fixtures, enviar cuatro solicitudes ficticias desde el sitio: A/B con igual período futuro y C/D con otros períodos. En el panel confirmar A; confirmar B debe fallar por disponibilidad, luego rechazarla. Confirmar y cancelar C; dejar D pendiente. Revisar filtros y resumen y consultar de nuevo el período liberado. Ver README para pasos y creación de la cuenta local. No se envían mensajes ni se cobra al cambiar estados.

Límites pendientes: revisión visual e interacción completa en navegadores y dispositivos para la etapa final; no hay calendario administrativo de bloqueos, comunicaciones automáticas, pagos o reembolsos. La paginación está acotada a 20 registros por página y los cambios de otras pestañas requieren recarga. No se crearon migraciones ni dependencias.

## Etapa 6: consulta pública y solicitudes pendientes (14 de noviembre de 2026)

Estado actual: cada cabaña publicada permite consultar disponibilidad y precio y enviar una solicitud PENDING. No confirma reservas, bloquea períodos pendientes, realiza cobros ni envía mensajes. Se conservaron modelos, migraciones, autenticación y reglas del dominio.

Archivos nuevos:

- `src/components/booking-form.tsx`: formulario responsive según modalidad, selección de huéspedes, consulta, estimado y desglose, datos mínimos de contacto, aceptación explícita de condición pendiente, confirmación y errores accesibles. Controles deshabilitados durante el envío; datos personales solo en memoria del formulario.
- `src/app/(public)/cabanas/booking-actions.ts`: frontera pública del servidor. Origen configurado obligatorio, límites de intentos, validación acotada, cabaña publicada, consulta y envío. Ignora totales del navegador y no devuelve filas, IDs privados ni datos personales.
- `src/modules/bookings/public-input.ts`: validación y conversión de fecha/hora local Santiago a los instantes usados por el dominio. Hora en punto y duración entera; rechaza cambios de horario ambiguos o inexistentes.
- `src/modules/bookings/quote-security.ts`: huella de selección/estimado y firma HMAC separada por propósito, usando el secreto existente del servidor; vence a los cinco minutos y no contiene datos del huésped. No modifica autenticación ni sesiones.
- `src/modules/bookings/public-limit.ts`: contadores atómicos compartidos en la tabla RateLimit existente; 40 consultas y 5 intentos de envío por minuto por instalación, incluso si son inválidos. Dos claves fijas, sin confiar en IP del cliente ni guardar correos como claves.
- `src/modules/bookings/public-types.ts`: respuestas serializables públicas limitadas.

Archivos modificados:

- `src/modules/bookings/service.ts`: nueva consulta `quoteRequest` usando el mismo `assertFree`, `estimateStay`, horarios y transacción existentes. `createRequest` puede exigir la huella de estimado verificada; recalcula y comprueba disponibilidad antes de guardar. Los llamados internos anteriores conservan su comportamiento. Las confirmaciones y su protección contra concurrencia no cambian.
- Detalle público de cabaña: sustituye el botón deshabilitado por el formulario sin rehacer la página ni su galería y tarifas.
- `src/lib/public-data.ts`: aviso público actualizado para explicar aceptación pendiente.
- `src/app/globals.css`: estilos del formulario, desglose, aceptación y campo trampa.
- Resumen, layout y placeholder de solicitudes administrativos: textos actualizados; no agregan lectura ni gestión de datos de huéspedes.
- `tests/domain.test.ts`: entradas públicas por hora, horas reales durante DST y rechazo de fecha, duración, modalidad o capacidad inválidas.
- `tests/auth.test.ts`: recorrido HTTP ampliado a consulta y envío públicos de ambas modalidades sin sesión, con comprobación de persistencia y privacidad.
- README y este registro: operación, pruebas y límites.

No se cambió `schema.prisma` ni se crearon migraciones o dependencias. Los modelos actuales ya contienen PENDING, total y desglose, y el registro de ocupación existente excluye las solicitudes pendientes. RateLimit ya estaba instalado para autenticación y se reutiliza con claves independientes.

Verificaciones realizadas:

- Revisión previa de instrucciones, documentación, servicios de reservas/precios y guía instalada de Next sobre Server Actions.
- `npm test`: ocho pruebas puras aprobadas.
- `npm run test:postgres`: cuatro migraciones existentes desde cero en la base local desechable; **17 pruebas aprobadas, cero fallos y cero omisiones**. Contenedor y fixtures eliminados al terminar.
- HTTP por noche: estimado con tarifa de temporada y base; consultar no escribe solicitudes; envío PENDING guarda total 175000 CLP y dos líneas de desglose, ignorando total del navegador de 1 CLP. La respuesta no incluye correo del huésped. Una solicitud pendiente no genera Occupancy ni impide otra consulta.
- HTTP por hora: fecha, hora y duración locales generan tres horas y 54000 CLP guardados como PENDING. Los dos formularios funcionan sin sesión administrativa.
- Confirmación mediante servicio interno vuelve ocupado el intervalo; bloqueos manuales también lo rechazan. El mismo servicio de ocupación y sus límites exclusivos siguen vigentes.
- Firma manipulada rechazada; cambios de tarifa después de consultar exigen volver a consultar; despublicación bloquea consultas; exceso de intentos impide nuevos registros. No se crearon solicitudes en la base de desarrollo.
- `npm run typecheck`, `npm run build` y `npm run db:validate`: correctos tras corregir únicamente el tipado de la tabla de casos inválidos de una prueba.

Para probar: iniciar PostgreSQL y `npm run dev`, usar el origen de BETTER_AUTH_URL y abrir una cabaña publicada. Por noche, seleccionar llegada/salida futuras y huéspedes; por hora, fecha futura, hora 0–23 y duración entera. Consultar, revisar estimado y completar nombre/correo y aceptación antes de enviar. La respuesta debe decir «Solicitud recibida» y pendiente de revisión. Ver README para fixtures y límites.

Pendiente: interfaz administrativa para revisar/aceptar/rechazar; protección perimetral o por visitante para mayor tráfico; CAPTCHA e idempotencia de envíos. El límite compartido puede ser agotado temporalmente por otro visitante y los reenvíos posteriores pueden crear solicitudes pendientes distintas. No hay pagos, correo o WhatsApp automáticos. No hubo revisión visual con navegador ni despliegue productivo; se verificaron formularios por HTTP y PostgreSQL local desechable.

## Etapa 5: catálogo, configuración y tarifas persistentes (14 de noviembre de 2026)

Estado actual: panel y páginas públicas conectados a PostgreSQL para identidad, contacto, horarios, políticas, cabañas, imágenes, servicios y tarifas. Se conservaron Better Auth, los guards, las tres migraciones previas y las reglas de intervalos y reservas. No se agregaron solicitudes públicas, disponibilidad, pagos ni notificaciones.

Cambios principales:

- `src/lib/admin-data.ts`: lecturas administrativas protegidas individualmente con `requireAdmin()`.
- `src/app/admin/manage-actions.ts`: creación/edición de cabañas, publicación/despublicación, eliminación, configuración y temporadas. Cada acción verifica sesión antes de validar o consultar la base y devuelve errores comprensibles. Revalidación del layout después de guardar.
- `src/modules/management/validation.ts` y `service.ts`: campos acotados, modalidades y estados cerrados, capacidad y CLP enteros, URL de imagen seguras, servicios e imágenes ordenadas. Escrituras relacionadas transaccionales y bloqueo por cabaña; no permite eliminar historial de solicitudes o bloqueos ni alterar sus reglas.
- `src/modules/pricing/service.ts`: edición y eliminación de temporadas, sin superposición y con fin excluido; conserva las funciones anteriores.
- `src/lib/public-data.ts`: configuración pública y DTO de cabañas publicadas, imágenes, servicios y tarifas; sin datos de autenticación ni reservas. React cache solo deduplica dentro de una petición, sin persistir contenido obsoleto.
- `src/components/action-form.tsx`, `admin-fields.tsx`, `cabin-editor.tsx`, `settings-editor.tsx`: formularios reutilizables, estado pendiente y errores accesibles; CSS responsive agregado sin rehacer el diseño.
- Nuevas páginas administrativas `/admin/cabanas/nueva` y `/admin/cabanas/[id]`; resumen, catálogo, configuración y layout administrativos conectados a datos persistentes y protegidos.
- Inicio, catálogo, detalle, encabezado, pie, colores y metadatos públicos conectados a la base. Detalles de borradores o despublicados devuelven 404. Galería y tarifas de temporada visibles, sin calcular disponibilidad.
- `src/app/error.tsx` y `global-error.tsx`: errores de carga sin exponer detalles internos.
- `src/lib/format.ts`: moneda y locale fijos del dominio; no importa fixtures para formatear precios.
- `src/modules/management/demo.ts`, `scripts/seed-demo.ts` y script `db:seed:demo`: carga manual de desarrollo, con bloqueo transaccional y marca idempotente; nunca sobrescribe registros existentes ni restaura eliminaciones tras la primera carga. Fixtures originales conservados en `business.ts` y `cabins/data.ts`.
- `prisma/schema.prisma` y `202611140004_development_seed/migration.sql`: solo agregan la marca `DevelopmentSeed`. No se modifica el modelo ni SQL anterior de autenticación, reservas o restricciones.
- `tests/auth.test.ts`: recorrido HTTP ampliado con acciones reales de formularios, lectura pública y seed idempotente. README actualizado con límites y pasos de operación. Sin nuevas dependencias.

Verificaciones realizadas:

- Revisión previa de AGENTS.md, README, IMPLEMENTACION, dependencias, modelos y servicios. Lectura de las guías instaladas de Next sobre Server Actions y consultas con ORM.
- `npx prisma format`, `npm run db:generate`; generación de la cuarta migración con diff entre esquemas, sin shadow database.
- `npm run db:local:migrate`: destino local verificado y cuarta migración aplicada correctamente en `cabanias_dev`.
- `npm run test:postgres`: cuatro migraciones desde cero en `cabanias_test`; **16 pruebas aprobadas, cero fallos y cero omisiones**. Se conservaron las pruebas previas de autenticación, concurrencia y restricciones.
- Recorrido HTTP: creación en borrador; modificación de modalidad, datos e imágenes; publicación; lectura pública de precio, servicios y galería; cambios de configuración visibles; alta, edición, rechazo de superposición y eliminación de temporadas; despublicación (catálogo oculto y detalle 404), republicación y eliminación definitiva.
- Escritura de cabaña sin sesión rechazada sin crear registros; modalidad inválida devuelve error visible. Se conservan guards en cada lectura y modificación administrativa.
- Seed probado en la base desechable: conserva configuración editada, no cambia una cabaña renombrada ni restaura una eliminada al repetirse. No se ejecutó la carga demo sobre desarrollo ni se crearon cuentas en esa base.
- `npm run typecheck`, `npm run build` y `npm run db:validate`: correctos. Las rutas públicas y administrativas se renderizan dinámicamente, sin necesitar una compilación tras editar datos.

Durante la verificación se corrigió el estrechamiento del tipo de modalidad para Prisma y la comparación de texto HTML de prueba, que incluía comentarios separadores de React. La suite volvió a pasar completa. No hubo que cambiar migraciones o restricciones previas.

Cómo usarlo: iniciar PostgreSQL, aplicar migraciones y ejecutar `npm run db:seed:demo` si se quieren fixtures. Iniciar sesión en `/login` con la cuenta elegida (o crearla mediante `npm run admin:create` en terminal). Cambiar datos en `/admin/configuracion` o `/admin/cabanas`, guardar y recargar `/` o el detalle público. Una pestaña ya abierta no recibe actualizaciones en tiempo real.

Límite de imágenes: únicamente referencias `/images/...` o URL HTTPS (HTTP solo en loopback). Hasta diez por cabaña con texto alternativo; la primera es portada. No hay subida, almacenamiento, optimización ni eliminación de archivos; cambiar la referencia no modifica el archivo remoto/local. Publicar requiere una imagen. No se hizo revisión visual con navegador; la verificación fue HTTP, TypeScript, compilación y PostgreSQL.

## Etapa 4: autenticación administrativa (14 de noviembre de 2026)

Estado actual: panel protegido por Better Auth 1.7.23, conservando todas las pantallas y datos ficticios. No se conectaron reservas, tarifas ni configuración operativa a las pantallas. No se creó ninguna cuenta administradora en desarrollo; el dueño debe elegir sus credenciales mediante el comando interactivo documentado en README.

Archivos principales nuevos:

- `src/modules/auth/core.ts`: configuración de Better Auth, adaptador Prisma, cuenta inicial solo por CLI, sesiones persistentes, política de cookies y limitador persistente.
- `src/lib/auth.ts`, `src/lib/require-admin.ts`: instancia del servidor y guard que consulta sesión y cuenta activa.
- `src/app/api/auth/[...all]/route.ts`: allowlist de inicio, cierre y consulta de sesión; ningún endpoint de registro público. Bucket de límite compartido por instalación, sobrescrito en el servidor para evitar cabeceras IP manipuladas.
- `src/app/(public)/login/page.tsx`, `src/components/login-form.tsx`: acceso responsive sin datos de cuenta predeterminados.
- `src/app/admin/actions.ts`: cierre de sesión protegido; Better Auth y su plugin oficial Next gestionan revocación y cookies.
- `scripts/auth-setup.mjs`: genera secreto aleatorio local en `.env`, sin mostrarlo.
- `scripts/create-admin.ts`: solicita correo, nombre y contraseña oculta con confirmación, solo desde TTY y contra desarrollo local. No recibe contraseña por argumentos o pipes.
- `tests/auth.test.ts`: verificación HTTP contra Next y PostgreSQL desechable, con credenciales aleatorias solo en memoria.
- `prisma/migrations/202611140003_admin_auth/migration.sql`: tablas de sesiones, cuentas, verificación y limitador; adaptación de `Administrator`, singleton CHECK/UNIQUE y protección frente a cuentas heredadas.

Archivos modificados: esquema Prisma, package.json/lock, `.env.example`, layout y cuatro páginas administrativas (guard individual), estilos del formulario, `next.config.ts` para separar la salida de pruebas, `scripts/local-db.mjs` para incluir autenticación en integración, README y este registro. Next añadió los directorios de tipos de prueba a `tsconfig.json`.

Dependencias: Better Auth y `@better-auth/prisma-adapter` 1.7.23, más `@inquirer/prompts` para entrada oculta. Se comprobó compatibilidad declarada con Next 16, React 19 y Prisma 7; Prisma se conserva en 7.10.1. Auditoría npm sin vulnerabilidades reportadas al instalar.

Verificaciones realizadas:

- `npm run auth:setup`: generó secreto local, sin imprimirlo. `.env` continúa ignorado por Git.
- `npx prisma format`, `npm run db:generate` y `npm run db:validate`: correctos.
- Migración generada con `prisma migrate diff --from-schema ... --to-schema ... --script`, sin shadow database. Se añadió manualmente la comprobación de cuentas heredadas y el CHECK singleton.
- `npm run db:local:migrate`: verificó el destino y aplicó la tercera migración en `cabanias_dev`. No se crearon usuarios.
- `npm run test:postgres`: aplicó tres migraciones desde cero en `cabanias_test`; **16 pruebas aprobadas, cero fallos y cero omisiones**. Contenedor y cuenta de pruebas eliminados después.
- Prueba HTTP: cuatro páginas sin sesión redirigen, cookie falsa no permite entrar, navegación RSC directa queda protegida, sesión válida permite entrar, registro devuelve 404, credenciales incorrectas devuelven 401, origen ajeno devuelve 403 y exceso de intentos devuelve 429.
- Acción real de cierre llamada directamente sin sesión: redirige y no modifica sesiones. Con sesión válida la revoca; reutilizar la cookie anterior ya no permite entrar. Desactivar la cuenta también impide entrar.
- Cuenta única rechazada tanto por el bootstrap como por PostgreSQL. `Account.password` contiene hash, no contraseña. Cookies locales verificadas HTTP-only y SameSite=Lax; configuración HTTPS activa Secure y un origen remoto HTTP se rechaza.
- `npm run typecheck` y `npm run build`: correctos.

Durante la verificación se corrigió el aislamiento del servidor de pruebas frente al servidor de desarrollo ya abierto y se adaptó la prueba RSC para seguir la redirección canónica de Next antes de revisar la autorización. La comprobación inicial de diff desde un directorio de migraciones requería shadow database; se sustituyó por diff entre esquemas, sin crear otra base ni modificar migraciones anteriores.

Para entrar localmente: `npm run auth:setup`, `npm run db:local:migrate`, `npm run admin:create` en terminal interactiva y luego `npm run dev`; visitar `http://localhost:3000/login` con las credenciales elegidas. Si el servidor estaba abierto antes de configurar variables, reiniciarlo. No hay contraseña predeterminada ni registro público. El bootstrap actual está limitado al entorno local; no se aprovisionó una cuenta productiva. HTTPS en un despliegue real y revisión visual en navegador no fueron probados; se verificó HTTP local y la configuración de cookies HTTPS.

## Etapa 3: PostgreSQL local verificado (14 de noviembre de 2026)

Estado actual: PostgreSQL 17 local en Docker Compose, migraciones aplicadas en desarrollo e integración ejecutada en un contenedor de pruebas separado. Los registros de etapas anteriores se conservan como historial.

Archivos nuevos:

- `compose.yaml`: proyecto `cabanias-local`, servicio persistente `postgres`, servicio temporal `postgres-test`, puertos solo en `127.0.0.1`, healthchecks y secretos desde archivos.
- `scripts/local-db.mjs`: generación de credenciales locales, inicio/parada, comprobación de conexión e identidad, migración protegida y ciclo de pruebas con limpieza automática.
- `scripts/local-db-safety.mjs`: lista cerrada de destinos locales permitidos, sin destinos remotos ni esquema alternativo.
- `tests/local-db-safety.test.ts`: rechazo de destinos ajenos al entorno local de pruebas.

Archivos modificados:

- `.gitignore`: excluye `.local/`; `.env` ya estaba excluido por `.env*`.
- `.env.example`: instrucciones, sin contraseñas.
- `package.json` y `package-lock.json`: dependencia explícita `pg` para comprobar el servidor y scripts `db:local:setup`, `db:local:up`, `db:local:down`, `db:local:migrate`, `test:postgres`. `npm test` queda limitado a pruebas sin base de datos.
- `tests/postgres.test.ts`: protección del destino; verificación de extensión, restricciones y triggers; comprobación del error de exclusión en carrera concurrente directa y rollback de un bloqueo incompatible.
- `README.md` y este registro.

Archivos locales generados y excluidos de Git: `.env`, `.local/dev-password`, `.local/test-password`. Contraseñas aleatorias separadas; no se imprimieron en consola. El script no sustituye conexiones existentes ajenas al entorno local.

Destinos utilizados:

| Uso | Base | Puerto de loopback | Persistencia |
| --- | --- | --- | --- |
| Migración de desarrollo | `cabanias_dev` | `54329` | `cabanias-local_postgres_data` |
| Migración y pruebas aisladas | `cabanias_test` | `54330` | `tmpfs`, contenedor eliminado al finalizar |

Revisión de SQL: ambas migraciones existentes se aplicaron sin errores y no requirieron cambios. Se comprobó `btree_gist` 1.7 instalado, ambas restricciones `EXCLUDE USING gist` con rangos `[)` y los seis triggers de validación, sincronización y protección. Se probó la eliminación en cascada de ocupación, confirmación simultánea por servicio y escrituras directas, solicitud pendiente sin ocupación, bloqueo contra confirmación, cancelación, temporadas incompatibles y límites contiguos. Las migraciones SQL personalizadas se conservan intactas.

Comandos y resultados:

- `docker --version`, `docker compose version`, `docker info`: Docker disponible; se inició Docker Desktop con `docker desktop start` porque el motor estaba detenido.
- `npm install pg`: dependencia explícita; auditoría sin vulnerabilidades reportadas.
- `npm run db:local:setup`: creó secretos y conexiones locales ignorados por Git.
- `docker compose config --quiet`: configuración válida, sin imprimir secretos.
- `npm run db:local:up`: descargó la imagen oficial de PostgreSQL y esperó a su estado saludable.
- `npm run db:local:migrate`: comprobó URL, base, usuario, zona e identificador del clúster contra el contenedor antes de aplicar ambas migraciones en `cabanias_dev`.
- `npm run test:postgres`: migraciones desde cero en `cabanias_test`; **15 pruebas aprobadas, cero fallos y cero omisiones**, incluyendo pruebas puras, protección de destino, suite principal y siete casos de integración. Contenedor de pruebas eliminado después.
- Consulta de catálogos mediante `docker compose exec -T postgres psql`: extensión, exclusiones, seis triggers y dos migraciones terminadas confirmados; cero solicitudes en desarrollo.
- `npm run db:local:down`, `npm run db:local:up`, `npm run db:local:migrate`: recreación del contenedor conservando el volumen; migraciones ya aplicadas, sin pendientes.
- `npm test`: siete pruebas sin base aprobadas. `npm run typecheck` y `npm run build`: correctos.

Una primera consulta manual de inspección falló por escape de comillas en PowerShell; se corrigió enviando SQL por stdin. No fue un fallo de migración. Se corrigió también una directiva TypeScript innecesaria detectada por el chequeo y se volvió a verificar.

Al finalizar, desarrollo queda iniciado en loopback; pruebas ya no existe. Para detener: `npm run db:local:down`. Para volver a iniciar: `npm run db:local:up`. El volumen no se elimina con esos comandos. No se ejecutaron migraciones alojadas, no se usaron credenciales de producción, no se recibieron reservas reales y no se conectó ninguna pantalla al dominio.

## Etapa 2: modelo y dominio (14 de noviembre de 2026)

Se conservan las páginas, componentes, estilos y datos ficticios de la primera etapa. No se conectó el panel a PostgreSQL ni se añadieron endpoints públicos, autenticación, pagos o reservas reales.

Archivos modificados:

- `prisma/schema.prisma`: configuración de un negocio, administrador, cabañas, imágenes, servicios, temporadas, solicitudes, bloqueos y ocupación interna.
- `package.json` y `package-lock.json`: adaptador PostgreSQL 7.10.1, Temporal, `server-only`, ejecutor de pruebas `tsx` y scripts de generación, migración y pruebas. Prisma se conserva en 7.10.1.
- `.env.example`: variables vacías, sin credenciales de ejemplo inventadas.
- `README.md` y este documento: funcionamiento, límites, preparación y verificaciones.

Archivos nuevos:

- `prisma/migrations/migration_lock.toml`.
- `prisma/migrations/202611140001_initial_domain/migration.sql`: estructura generada desde el esquema sin conexión.
- `prisma/migrations/202611140002_domain_invariants/migration.sql`: checks, exclusiones GiST y triggers de sincronización y validación.
- `src/lib/db.ts`: cliente diferido, exclusivo del servidor.
- `src/modules/bookings/domain.ts`: intervalos, validaciones, transiciones, fechas en Santiago y cotizaciones CLP.
- `src/modules/bookings/service.ts`: solicitudes internas, confirmación transaccional, cancelación/rechazo y bloqueos.
- `src/modules/settings/service.ts`: lectura y escritura de configuración singleton.
- `src/modules/pricing/service.ts`: tarifas base y temporadas sin superposición.
- `tests/domain.test.ts`: reglas puras, incluidos cambios de horario de Santiago.
- `tests/postgres.test.ts`: integración y concurrencia, optativa con base desechable.
- `src/generated/prisma/`: cliente generado localmente, ignorado por Git y reproducible con `npm run db:generate`.

Verificaciones realizadas:

- Revisión previa de README, inventario, package.json, esquema y configuración de Prisma; consulta de documentación oficial actual y ayuda de la CLI instalada.
- `npm list prisma @prisma/client`: ambos 7.10.1.
- Comprobación de presencia de `DATABASE_URL` sin imprimir su contenido: no configurada.
- `npm install @prisma/adapter-pg@7.10.1 @js-temporal/polyfill server-only` y `npm install -D tsx`; auditoría de npm sin vulnerabilidades reportadas.
- `npx prisma format`, `npm run db:generate` y `npm run db:validate`: correctos.
- `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/202611140001_initial_domain/migration.sql`: generó SQL sin aplicar cambios.
- `npm test`: seis pruebas puras correctas; suite PostgreSQL omitida por falta de `TEST_DATABASE_URL`.
- `npm run typecheck` y `npm run build`: correctos, conservando todas las rutas visuales.

**No se ejecutó ninguna migración, ni se comprobó el SQL contra un servidor PostgreSQL ni se ejecutaron carreras concurrentes reales.** Falta proporcionar una conexión propia y ejecutar `npm run db:deploy`. La suite PostgreSQL necesita las dos migraciones aplicadas en una base desechable y `TEST_DATABASE_URL`. El README detalla los pasos y el requisito `btree_gist`.

Las exclusiones y triggers están en SQL personalizado: Prisma no los representa completamente. No reemplazar las migraciones por `db push`. No se crearon cuentas, semillas ni datos personales.

Fuentes consultadas: [Prisma 7 y adaptadores](https://www.prisma.io/docs/orm/v7), [funciones SQL no representadas por Prisma](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features), [rangos y exclusión PostgreSQL](https://www.postgresql.org/docs/current/rangetypes.html).

## Registro histórico: etapa 1

## Archivos creados

- `.env.example`
- `.gitignore`
- `README.md`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `prisma.config.ts`
- `prisma/schema.prisma`
- `public/images/bosque.svg`
- `public/images/cerro.svg`
- `public/images/logo.svg`
- `public/images/rio.svg`
- `src/app/(public)/cabanas/[slug]/page.tsx`
- `src/app/(public)/cabanas/page.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/(public)/page.tsx`
- `src/app/admin/cabanas/page.tsx`
- `src/app/admin/configuracion/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/solicitudes/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/not-found.tsx`
- `src/components/admin-nav.tsx`
- `src/components/cabin-card.tsx`
- `src/components/catalog.tsx`
- `src/components/public-shell.tsx`
- `src/components/ui.tsx`
- `src/config/business.ts`
- `src/lib/format.ts`
- `src/modules/cabins/data.ts`
- `tsconfig.json`
- `IMPLEMENTACION.md` (este documento).

## Comandos ejecutados

- PowerShell: `Get-ChildItem`, `Get-Content`, `Test-Path` para inspeccionar carpeta e instrucciones.
- `node --version` y `npm --version`.
- `npm view next version` y `npm view prisma version` para consultar versiones. Prisma usa la rama estable 7 registrada en el lockfile, no la version preliminar de la consulta.
- Scripts Python de escritura de los archivos y recursos SVG; `apply_patch` para la documentacion.
- `rg` para revisar archivos y textos.
- `npm install`: dependencias instaladas, auditoria sin vulnerabilidades reportadas.
- `npm run build`: compilacion de produccion correcta.
- `npm run typecheck`: sin errores.
- `npm run db:validate`: esquema valido, sin conexion a PostgreSQL.
- `npm run start -- --hostname 127.0.0.1 --port 3000`: servidor temporal para verificar rutas.
- PowerShell `Invoke-WebRequest`: HTTP 200 en inicio, catalogo, tres detalles, cuatro pantallas administrativas, logo e ilustracion principal; HTTP 404 en una cabana inexistente.

El servidor temporal se detuvo al finalizar. No se ejecutaron migraciones, generacion del cliente, reservas, autenticacion ni despliegue.

## Limites de verificacion

No hubo navegador de pruebas disponible. Se verificaron compilacion, tipos, esquema y respuestas HTTP; queda pendiente la inspeccion visual en dispositivos reales. Los estilos incluyen ajustes para movil, tablet, escritorio y movimiento reducido.

Las carpetas `node_modules/` y `.next/` y el archivo `tsconfig.tsbuildinfo` son artefactos locales ignorados, no codigo fuente.
