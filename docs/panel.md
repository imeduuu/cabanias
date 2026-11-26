## Personalización

- `src/config/business.ts` y `src/modules/cabins/data.ts`: fixtures ficticios para la carga inicial, no fuente de datos de las páginas.
- Panel `/admin/configuracion`: identidad, logo, colores, contacto público, correo para avisos, textos, horarios y políticas persistidos. El correo para avisos es distinto e independiente del contacto público y de la cuenta de acceso.
- Panel `/admin/cabanas`: fichas, modalidad NIGHTLY o HOURLY, capacidad, servicios, imágenes, publicación y tarifas.
- `public/images/`: logo e ilustraciones SVG locales. También se pueden referenciar imágenes por URL HTTPS, sin proveedor de almacenamiento ni subida de archivos.
- `src/components/`: componentes compartidos y filtros del catálogo.
- `src/app/globals.css`: estilos responsive para móvil, tablet y escritorio.
- `src/lib/format.ts`: formato de precios CLP.

Los textos generales de la interfaz están junto a sus componentes; la identidad pública proviene de `BusinessSettings`. CSS y los metadatos usan esa configuración en cada petición.

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

`npm run test:postgres` verifica estas operaciones por HTTP con una cuenta y datos efímeros en `cabanias_test`; conserva las pruebas anteriores de concurrencia y consulta pública. No se envían WhatsApp ni se procesan pagos o reembolsos automáticos.

Móvil: tarjetas en una columna, filtros apilados, contacto con corte de líneas y controles de al menos 48 px; no hay tabla ancha que obligue a desplazamiento horizontal. Se revisó CSS/estructura y respuesta HTTP con agente móvil. La revisión visual y de interacción en navegadores/dispositivos queda para la etapa final.

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
