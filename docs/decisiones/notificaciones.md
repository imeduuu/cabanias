# Decisión: notificaciones de solicitudes por correo

**Estado:** implementada.
**Alcance:** notificaciones transaccionales por correo para solicitudes de reserva. No cambia las reglas de disponibilidad, precios ni transiciones de estado.

## Eventos y destinatarios

| Evento persistido | Destinatario | Contenido funcional |
| --- | --- | --- |
| Se crea una solicitud `PENDING` | Correo del dueño configurado en `BusinessSettings.contactEmail` | Aviso de nueva solicitud pendiente y acceso al panel para revisarla. |
| La solicitud pasa a `CONFIRMED` | `BookingRequest.guestEmail` | Confirmación y resumen de la estadía. |
| La solicitud pasa a `REJECTED` | `BookingRequest.guestEmail` | Aviso de rechazo, sin presentarlo como reserva. |
| La solicitud pasa a `CANCELLED` | `BookingRequest.guestEmail` | Aviso de cancelación y resumen de la estadía. |

No se envían correos por cotizar, crear un bloqueo, consultar disponibilidad ni repetir una solicitud idempotente ya reconocida. No se envían notificaciones por transiciones que el dominio rechace.

## Persistencia y atomicidad

La migración `202611260001_notifications_outbox` agrega `NotificationOutbox`, `NotificationEvent` y `NotificationStatus`. Cada fila identifica la solicitud y el evento, guarda destinatario y payload mínimo congelado, estado (`PENDING`, `PROCESSING`, `SENT` o `ERROR`), intentos (máximo 3), próximo intento, marca de reclamo, error técnico acotado y fechas de creación/envío. Una clave única por solicitud y tipo de evento evita duplicados; la FK restringe borrar solicitudes con notificaciones aún conservadas.

La inserción en la outbox se hace en la **misma transacción PostgreSQL** que la operación de negocio:

- Si una solicitud se revierte, también se revierte su correo pendiente.
- Si cambia el estado de una solicitud, el cambio y su notificación se confirman juntos o ninguno se confirma.
- Un fallo posterior del proceso SMTP no borra el trabajo: la fila continúa pendiente o queda en reintento.

La outbox garantiza que el evento no se pierda entre el commit de la solicitud/estado y el inicio del envío; no puede garantizar que el buzón final reciba el mensaje. La entrega será de tipo **al menos una vez**: si el servidor SMTP acepta el correo pero la conexión falla antes de que el worker registre el éxito, un reintento podría duplicarlo. Usar un `Message-ID` estable derivado de la fila ayuda a rastrear duplicados, pero no todos los proveedores deduplican por ese encabezado.

El worker reclama filas con `FOR UPDATE SKIP LOCKED`, las marca `PROCESSING` con una concesión de cinco minutos, confirma esa transacción y solo entonces habla con SMTP. Al finalizar registra el resultado o el próximo reintento. Los reclamos abandonados se pueden recuperar después de vencer la concesión; un último reclamo vencido se marca `ERROR` en lugar de superar el máximo de intentos. No se mantienen bloqueos de base de datos durante una operación de red.

## Envío y reintentos

El comando `npm run notifications:send` procesa filas pendientes cuyo próximo intento ya venció. Se ejecuta periódicamente fuera del proceso web; no se envían correos dentro de una acción del usuario. Si hay fallos de entrega, el comando persiste el reintento/error y termina con código distinto de cero. Los parámetros SMTP faltantes o inválidos y destinatarios inválidos producen errores visibles sin reclamar ni consumir el intento de la fila.

Máximo de **3 intentos totales por fila**: primer envío y hasta dos reintentos. Ante fallo temporal, esperar primero 1 minuto y luego 5 minutos. Al agotarse los intentos, marcar la fila como fallida definitiva y dejarla visible para revisión operativa; no descartarla silenciosamente. Un fallo de configuración o de autenticación SMTP debe quedar explícito en logs sin incluir contenido del mensaje ni datos personales.

El transporte usa Nodemailer sobre SMTP genérico, configurado mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `SMTP_SECURE`; no se acopla a una API de proveedor. El usuario y la contraseña son opcionales, pero se configuran juntos. No se envía correo si faltan parámetros o si remitente/destinatario no son válidos.

Para desarrollo, Mailpit está en `compose.yaml` con SMTP `127.0.0.1:1025` e interfaz web `127.0.0.1:8025`. No entrega mensajes a destinatarios externos y permite inspeccionarlos en su interfaz. No es un destinatario alternativo ni se incorpora silenciosamente en producción.

## Datos personales y conservación

Minimizar los datos y no incluir información innecesaria en asuntos, logs o enlaces:

| Correo | Datos personales incluidos |
| --- | --- |
| Nueva solicitud al dueño | Nombre del huésped, correo y teléfono solo si se proporcionó; nombre de la cabaña, fechas/horas, cantidad de huéspedes y estado pendiente. El correo y teléfono permiten al dueño responder directamente. El total estimado puede mostrarse como dato de la solicitud, no es un dato personal; no incluir desglose sensible que el mensaje no necesite. |
| Confirmación al huésped | Nombre del huésped, nombre de la cabaña, fechas/horas, cantidad de huéspedes y total estimado/moneda guardados en la solicitud. Incluir el contacto público del negocio para consultas. No repetir teléfono del huésped. |
| Rechazo al huésped | Nombre del huésped, nombre de la cabaña y fechas/horas para identificar qué solicitud se rechazó; estado y contacto público del negocio. Omitir teléfono y, por defecto, omitir el total. |
| Cancelación al huésped | Nombre del huésped, nombre de la cabaña y fechas/horas para identificar la solicitud; estado y contacto público del negocio. Omitir teléfono y datos de pago (no se procesan pagos). |

No usar CC/BCC a terceros. Escapar y codificar correctamente los valores al generar HTML y texto plano; evitar datos personales en URLs, `Message-ID`, logs, métricas o mensajes de error.

Política aplicada para **la copia adicional de la outbox**:

- En espera o reintento: conservar mientras la notificación siga siendo procesable, con destinatario y solo los campos mínimos para el envío.
- Envío correcto: borrar el contenido/destinatario de la fila inmediatamente después de registrar éxito; el worker purga los metadatos técnicos 30 días después del envío.
- Fallo definitivo tras 3 intentos: conservar la fila con el contenido mínimo hasta 30 días desde su creación para diagnóstico; el worker la purga después. No se guardan métricas agregadas en esta implementación.

La retención de la outbox no sustituye ni amplía la política de conservación de `BookingRequest`, que contiene los datos originales de la solicitud y hoy no tiene una caducidad automática documentada. Definir o cambiar la retención de esas solicitudes requiere una decisión de privacidad independiente; no eliminarlas como efecto lateral de purgar correos.

## Enganches en `src/modules/bookings/service.ts`

- **Nueva solicitud:** `persistRequest(tx, input)` es el punto común que valida y crea una `BookingRequest` `PENDING`. Después de `tx.bookingRequest.create`, insertar en la outbox el evento de nueva solicitud usando el `request` recién creado y el correo del dueño configurado. Al estar dentro de `tx`, la fila queda ligada al commit de la solicitud. El camino estándar `createRequest` pasa por esta función; `createIdempotentRequest` también la usa cuando crea una solicitud nueva, pero retorna antes de ella al reconocer un reintento idempotente existente.
- **Confirmación, rechazo o cancelación:** en `changeRequestStatus`, conservar las comprobaciones actuales de existencia, bloqueo de cabaña, relectura, `assertTransition` y las validaciones de confirmación. Después de `tx.bookingRequest.update`, encolar el evento que corresponde al estado actualizado y dirigirlo al `guestEmail` de esa solicitud. No encolar si la operación no llega a esa actualización; cualquier error posterior debe revertir tanto el cambio como el evento.
- **No alterar reglas:** no mover ni duplicar validaciones, no crear una notificación en `quoteRequest`, `createManualBlock` o `removeManualBlock`, no cambiar el trigger de `Occupancy`, ni hacer que el envío SMTP condicione el resultado de la transacción de negocio. Las pruebas PostgreSQL cubren rollback, creación idempotente y confirmación; los eventos de rechazo/cancelación usan el mismo enganche transaccional.

El esquema Prisma y la migración SQL incorporan la outbox. La migración es aditiva: no altera ni recrea los triggers de `Occupancy` ni las restricciones `EXCLUDE USING gist`. Las pruebas de migración se ejecutan solamente en `cabanias_test`.

## Alternativas descartadas

- **Enviar SMTP dentro de la transacción o directamente desde la acción web:** el SMTP puede tardar o fallar, prolonga bloqueos y un rollback posterior no puede retirar un correo ya enviado; a la inversa, el commit podría completarse y el proceso caer antes del envío.
- **Enviar solo después del commit sin outbox:** hay una ventana entre commit y envío en la que una caída del proceso pierde la notificación.
- **Usar únicamente una cola alojada o un proveedor específico:** añade dependencia y posible costo, y separar la escritura del evento de la transacción PostgreSQL reintroduce riesgo de pérdida. Puede reconsiderarse si escala o requisitos de entrega lo justifican.
- **Enviar desde triggers PostgreSQL:** acopla reglas de persistencia a infraestructura de correo, no ofrece un transporte SMTP fiable ni control apropiado de reintentos, plantillas y observabilidad.
- **Enviar solo a demanda desde la pantalla administrativa:** no informa al dueño de una nueva solicitud y depende de que una persona recuerde enviar cada respuesta.

## Riesgos y límites

- La entrega SMTP puede retrasarse o fallar permanentemente; tras los 3 intentos se requiere alerta/revisión operativa y un procedimiento explícito de reenvío.
- La semántica de al menos una vez puede producir duplicados en el caso ambiguo de aceptación SMTP sin confirmación registrada.
- Una outbox con información personal aumenta el impacto de acceso indebido; limitar permisos, minimizar el payload, proteger secretos SMTP y cumplir la purga periódica.
- Errores de dirección, rebotes, spam o mala reputación del dominio no quedan resueltos por la outbox. SPF, DKIM, DMARC, remitente verificado y monitoreo son responsabilidad de la configuración operativa del proveedor.
- El comando requiere un planificador que lo ejecute regularmente en cada entorno. Ejecutarlo manualmente o desplegar el código sin programarlo deja correos pendientes.
- Cambios del correo del dueño entre la creación y el envío: congelar el destinatario configurado en el evento evita que una notificación ya generada se redirija inesperadamente.
- Mailpit es solo una herramienta local de desarrollo; una configuración incorrecta podría exponer su interfaz o dirigir datos de desarrollo a un SMTP externo.
- La implementación cubre notificaciones transaccionales, no marketing, pagos, WhatsApp, confirmación de dirección ni políticas de cancelación/reembolso.
