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
