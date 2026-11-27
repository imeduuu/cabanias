# Alta de un negocio nuevo

Cada negocio se opera como una instalación independiente: un despliegue/proyecto de aplicación, su propio conjunto de variables y una base PostgreSQL exclusiva. No se comparte base, esquema, cuenta administradora, secreto de autenticación, almacenamiento de imágenes ni credenciales SMTP entre clientes. La aplicación incluye una sola cuenta administradora por base.

## 1. Preparar la instalación

1. Crea un proyecto de despliegue independiente para el negocio a partir de esta base reutilizable. Fija la versión de Node compatible con `package.json` (Node 22.12 o superior) y conserva el lockfile.
2. Configura compilación/arranque de producción según [Despliegue](deployment.md). No copies `.env`, `.local/`, contraseñas de desarrollo ni datos de demostración.
3. Reserva un directorio persistente y privado para las imágenes cargadas por el dueño. En la instalación OCI, monta el volumen en la ruta configurada por `IMAGE_STORAGE_DIR` (por ejemplo `/data/images`). Incluye ese volumen en el plan de respaldo.

## 2. Crear PostgreSQL exclusivo

1. Crea una instancia/cluster o base lógica exclusiva para este negocio y un usuario de aplicación/migraciones con acceso solo a esa base. Guarda la cadena PostgreSQL en el gestor de secretos del despliegue.
2. Usa TLS para conexiones remotas. Para ejecutar migraciones, usa el endpoint directo del proveedor cuando el pooler no admita DDL; la aplicación puede usar la URL pooled si el proveedor la recomienda.
3. Habilita `btree_gist` en la base antes de migrar, ya sea concediendo permiso al usuario de migración o pidiendo al administrador del proveedor que ejecute `CREATE EXTENSION btree_gist`. La extensión es necesaria para las restricciones `EXCLUDE USING gist` de tarifas y disponibilidad.
4. Conserva la misma base exclusiva al configurar la app, crear al dueño, operar y programar respaldos. Verifica siempre el destino antes de cualquier comando que escriba.

## 3. Configurar variables

Configura en el entorno de producción; no las guardes en Git, en el código, ni en una imagen Docker. Los valores se deben obtener por un canal seguro y no deben incluirse en tickets o registros.

| Variable | Requisito |
| --- | --- |
| `DATABASE_URL` | Requerida. URL PostgreSQL de la base de este negocio, con TLS remoto. |
| `BETTER_AUTH_URL` | Requerida. Origen público exacto de acceso, por ejemplo `https://reservas.negocio.cl`, sin ruta, query ni fragmento. En producción debe ser HTTPS. |
| `BETTER_AUTH_SECRET` | Requerida. Secreto aleatorio, único por negocio y de al menos 32 caracteres. No reutilizar entre instalaciones. |
| `SITE_URL` | Requerida. Origen HTTPS canónico del sitio; debe corresponder al dominio publicado. |
| `IMAGE_STORAGE_DIR` | Opcional en OCI, donde el valor predeterminado es `/data/images`; si se define, usa una ruta persistente que sobreviva reinicios y esté respaldada. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` | Necesarias para habilitar envío de notificaciones. `SMTP_SECURE` es `true` o `false`; `SMTP_FROM` incluye una dirección válida. |
| `SMTP_USER`, `SMTP_PASSWORD` | Opcionales en conjunto si el proveedor permite relay sin autenticación; si uno se configura, ambos son obligatorios. |

`npm run setup:check` carga las variables del entorno (y `.env` si se ejecuta localmente), valida presencia y formato, longitud del secreto, conexión PostgreSQL, `btree_gist` y migraciones aplicadas. No imprime cadenas de conexión, secretos SMTP ni el secreto de Better Auth. El SMTP puede omitirse; si se configura parcialmente o con valores inválidos, el chequeo falla.

## 4. Validar y migrar la base nueva

Ejecuta estos comandos desde una instalación confiable y revisa que `DATABASE_URL` corresponda al cliente correcto:

```sh
npm ci
npm run db:validate
npm run setup:check
npm run db:deploy
npm run setup:check
```

El primer chequeo espera fallar en el control de migraciones porque la base es nueva; conexión y `btree_gist` deben funcionar. `db:deploy` aplica las migraciones versionadas. El segundo chequeo debe informar todas aplicadas. No uses `prisma db push`, `migrate reset` ni marques migraciones como aplicadas manualmente: se perderían o simularían reglas SQL escritas a mano, incluidos triggers y restricciones de exclusión. `setup:check` solo lee la base y no aplica cambios.

## 5. Crear la cuenta del dueño

Una vez migrada la base, crea la única cuenta administradora con acceso remoto de producción explícito:

```sh
NODE_ENV=production CABANIAS_ALLOW_PRODUCTION_DATABASE=1 npm run admin:create
```

En PowerShell, define `$env:NODE_ENV="production"` y `$env:CABANIAS_ALLOW_PRODUCTION_DATABASE="1"` antes de ejecutar `npm run admin:create`. Comprueba de nuevo que `DATABASE_URL` apunta a la base del cliente. Usa una terminal interactiva: el comando solicita correo, nombre y contraseña (12 a 128 caracteres) con entrada de contraseña oculta y confirmación. No acepta la contraseña por argumento ni por pipe. Entrega credenciales por canal seguro y solicita al dueño iniciar sesión y cambiar cualquier contraseña temporal acordada. El comando rechaza crear otra cuenta existente.

El inicio de sesión estará en `https://<dominio>/login`. El alta de usuarios está deshabilitada públicamente.

## 6. Configurar el negocio y sus cabañas

Inicia sesión como dueño y completa `/admin/configuracion` antes de publicar:

- Nombre, frase, descripción y ubicación reales.
- Correo público y teléfono de contacto; WhatsApp opcional en formato internacional E.164.
- Correo de avisos del negocio (independiente del correo de acceso del dueño).
- Colores, textos de portada, política de cancelación, hora de entrada/salida y plazo de retención de datos.
- Zona horaria `America/Santiago` y moneda `CLP` para la configuración de Chile soportada actualmente.

En `/admin/cabanas/nueva`, registra cada unidad con nombre, slug, descripción, modalidad (por noche o por hora), capacidad, dormitorios, tarifa base en CLP, servicios e imágenes reales con texto alternativo. Revisa la tarifa y agrega temporadas cuando corresponda. Mantén cada cabaña en borrador durante la revisión; publícala solo después de validar contenido, disponibilidad y precios. No ejecutes `db:seed:demo` en producción: agrega identidad y cabañas ficticias.

Envía una solicitud de prueba controlada y confirma que queda pendiente, que la disponibilidad/precio son correctos y que el dueño puede gestionarla desde `/admin/solicitudes` y revisar `/admin/calendario`. No confirmes reservas ficticias que puedan bloquear fechas reales.

## 7. Correo transaccional

Obtén del proveedor SMTP host, puerto, modo TLS, usuario/contraseña si aplica y remitente verificado. Configura las variables SMTP en el entorno del mismo despliegue y prueba primero en una bandeja controlada. Las solicitudes se encolan en PostgreSQL; el proceso web no envía el correo en línea. La tarea `npm run notifications:send` debe ejecutarse periódicamente para despachar la cola. Revisa la entrega, spam, rebotes y el registro de errores sin registrar credenciales.

## 8. Dominio y HTTPS

Configura DNS del dominio para el host elegido, verifica el dominio y activa certificado TLS. Fuerza HTTPS. Define `BETTER_AUTH_URL` y `SITE_URL` con el mismo origen canónico final (o `SITE_URL` en el host canónico redirigido). Actualiza ambas variables al cambiar dominio, reinicia/re despliega la aplicación y prueba login, logout, cookies seguras, enlaces absolutos, sitemap y formulario público. No compartas cookies ni subdominios de autenticación entre negocios.

## 9. Tareas programadas

Programa comandos en el host/servicio de tareas, con el directorio de trabajo de esta instalación, acceso a su entorno de variables y un bloqueo para evitar ejecuciones solapadas. Conserva salida operativa sin volcar el entorno ni secretos.

- Notificaciones: `npm run notifications:send` cada minuto o cada pocos minutos, según el volumen. Alerta si hay fallos repetidos o si la cola crece.
- Limpieza: `NODE_ENV=production CABANIAS_ALLOW_PRODUCTION_DATABASE=1 npm run maintenance:cleanup -- --apply` una vez al día. En PowerShell define primero las dos variables de entorno. Valida inicialmente el conteo en modo simulación, que es el comportamiento sin `--apply`.
- Respaldo: copia diaria y antes de cambios de versión o migraciones (ver abajo).

Las tareas deben apuntar a la misma instalación/base del negocio; configura cada scheduler por separado. No coloques contraseñas en la línea de comandos, repositorio o logs.

## 10. Respaldos y restauración

Configura un destino de respaldo independiente y cifrado con retención acorde al contrato. Define `BACKUP_DATABASE_URL` en el gestor de secretos y ejecuta diariamente:

```sh
npm run db:backup -- /ruta/privada/respaldos
```

El directorio debe quedar fuera del servidor/base de datos y tener permisos restringidos. Incluye por separado el volumen de imágenes y los datos de infraestructura necesarios. Recomienda conservar 30 copias diarias y 12 mensuales, si la política del negocio lo permite. Verifica que cada respaldo termine correctamente y prueba periódicamente su restauración en una base aislada. La restauración reemplaza los objetos del destino explícito; sigue el procedimiento de confirmación de [Respaldos y restauración](respaldos.md), confirma negocio y base antes de ejecutarla, y nunca pruebes sobre la base activa.

## Lista de entrega

- [ ] Proyecto de aplicación, secretos, almacenamiento de imágenes y base exclusivos del negocio.
- [ ] `npm run setup:check` correcto tras desplegar migraciones.
- [ ] Cuenta del dueño creada y acceso probado.
- [ ] Identidad, contacto, correo de avisos, políticas, horarios, cabañas y tarifas revisados.
- [ ] SMTP probado y tarea de envío observada.
- [ ] DNS, origen canónico y HTTPS comprobados.
- [ ] Limpieza y respaldos programados; restauración probada fuera de producción.
- [ ] Solicitud de prueba revisada y retirada/cancelada sin ocupar disponibilidad real.
