# Datos personales de solicitudes

En **Configuración**, puedes elegir por cuántos meses se conservarán el nombre, correo y teléfono de las solicitudes terminadas. El valor inicial es 24 meses; se permite configurar entre 1 y 1200 meses.

Cuando una estadía lleva más tiempo que ese plazo desde su fecha de salida, `maintenance:cleanup` puede anonimizar esos tres datos en solicitudes rechazadas, canceladas o confirmadas. Una solicitud pendiente nunca se anonimiza. La fecha de salida marca el fin de la estadía; la antigüedad del registro o de su respuesta no cambia el cálculo. El límite es estricto: una estadía justo en la fecha de corte todavía se conserva.

La limpieza se limita a reemplazar el nombre por «Solicitud anonimizada», asignar un correo técnico que no recibe mensajes y vaciar el teléfono. La simulación es el modo predeterminado: muestra cuántas filas coinciden y no modifica nada. Para aplicar los cambios, ejecuta `npm run maintenance:cleanup -- --apply`.

Se conservan las solicitudes y los datos técnicos necesarios para reconocer reenvíos, además de fechas, cabaña, estado, huéspedes, precio y desglose. Así, la limpieza no elimina reservas ni rompe relaciones de la base de datos. Los correos y contenidos que ya se hayan guardado para notificaciones tampoco se modifican con esta tarea.
