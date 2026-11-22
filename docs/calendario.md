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
