# Decisión: hosting inicial con presupuesto cero

**Estado:** propuesta adoptada para una primera publicación de bajo tráfico; revisar antes de operar reservas reales.
**Fecha de revisión:** 27 de noviembre de 2026.
**Presupuesto:** USD 0 al mes. Se asume que ya se dispone de un dominio (o se acepta un subdominio dinámico gratuito) y de credenciales SMTP; esos servicios no quedan incluidos en el hosting.

## Decisión

Usar una instancia elegible de Oracle Cloud Infrastructure Always Free como VPS autoadministrado, con Docker Compose para Next.js y PostgreSQL 17, Caddy como proxy HTTPS y cron del host para los dos comandos de mantenimiento. Guardar PostgreSQL y las imágenes en volúmenes persistentes; realizar `pg_dump` cifrado periódico a un bucket Cloudflare R2, dentro del cupo gratuito. La app hoy no sube imágenes: admite URLs HTTPS o recursos de `public/images`; por ahora conservar esa operación y documentar R2 como destino cuando se implemente carga de archivos.

La migración inicial instala `btree_gist` (`prisma/migrations/202611140002_domain_invariants/migration.sql`). PostgreSQL 17 es suficiente y la extensión está incluida en la distribución oficial. Mantener el contenedor en una versión mayor fijada y validar migraciones en una base de staging antes de actualizar.

Esta es la alternativa más cercana a USD 0 que cubre los requisitos técnicos, no una garantía de servicio de producción. Depende de que haya capacidad Always Free en la región, que la cuenta pueda aprovisionarse y que OCI mantenga los recursos elegibles. Es una sola VM, sin alta disponibilidad ni soporte administrado. No registrar reservas reales hasta probar restauración y aceptar expresamente ese riesgo.

## Comparación

| Opción | Ajuste a requisitos | Costo con USD 0/mes | Evaluación |
| --- | --- | --- | --- |
| OCI Always Free + Docker Compose | Node 22, PostgreSQL 15+ con `btree_gist`, HTTPS con Caddy, cron del host, volumen persistente y respaldo externo: todo se puede configurar. | $0 mientras recursos y tráfico estén dentro de Always Free; R2 tiene cupo gratuito mensual. | **Elegida** por poder correr la app, DB y tareas en una sola VM sin planificador de pago. Requiere administración, monitoreo y restauraciones manuales. |
| Railway Free | Contenedores y Postgres disponibles; soporta cron jobs solo durante la prueba, volúmenes pequeños y servicios que duermen. | $1 de crédito mensual en Free; cron no queda incluido después de la prueba. | No cumple a largo plazo los dos cron programados ni garantiza proceso siempre activo. Hobby cuesta al menos USD 5/mes. |
| Render Free | Web service y Postgres; `btree_gist` aparece entre las extensiones admitidas en PostgreSQL 13+. | $0, pero el Postgres gratis es de 1 GB, expira a los 30 días y no tiene backups. Los cron jobs y discos persistentes se cobran. | Descartada: no da persistencia/respaldos adecuados ni cron gratis; el web service puede dormir y no se recomienda para producción. |
| Fly.io Free | Máquinas, volúmenes locales y despliegue Docker; se puede instalar Postgres propio y programar tareas en una máquina. | Incluye hasta USD 5 de uso mensual, no recursos ilimitados; Postgres administrado externo y extensiones no están disponibles en Free. | Técnicamente viable autoadministrado, pero la suma de VM, volumen, base y salida puede superar el saldo. No es una base gratis permanente garantizada. |
| VPS comercial económico + Docker | Encaja con todos los requisitos; backups y cron quedan bajo control propio. | No cumple $0: se paga desde el primer mes. | Preferible cuando exista presupuesto para una VM con recursos previsibles, backups y soporte comercial. |

## Operación prevista

- Contenedor web con Node.js 22 y `npm run start`; PostgreSQL 17 en su propio servicio y volumen, sin publicar el puerto de la base a Internet.
- Caddy termina HTTPS y renueva certificados automáticamente. Usar un dominio ya disponible o un nombre DNS gratuito que permita emitir certificados; reservar cualquier costo de dominio fuera de este presupuesto.
- Configurar dos entradas de cron diarias en UTC, con ruta de trabajo y variables seguras. Ejecutar `npm run notifications:send` según la urgencia aceptable de los avisos (por ejemplo, cada 5 minutos), y `npm run maintenance:cleanup -- --apply` una vez al día. Evitar solapamientos y registrar salida/errores sin datos personales.
- Montar datos de PostgreSQL y, cuando exista carga de archivos, el directorio de imágenes en volúmenes persistentes. No confiar en el filesystem efímero de la imagen Docker. Mientras no haya carga implementada, las imágenes locales versionadas permanecen en `public/images` y las externas deben ser HTTPS.
- Crear `pg_dump` comprimido y cifrado diario; subirlo a R2 con política de retención limitada (por ejemplo 14 copias diarias y 3 mensuales). Probar restauración periódicamente. El volumen de OCI no sustituye una copia independiente; proteger claves de OCI/R2 y no guardarlas en el repositorio.
- Mantener SMTP en un proveedor separado y configurar `SMTP_*`; OCI/R2 no entregan correo. Confirmar que el SMTP elegido permite el volumen previsto y alertar sobre errores definitivos de outbox.
- Poner límites de gasto/alertas en los paneles de Oracle y Cloudflare cuando estén disponibles. No habilitar automáticamente recursos de pago. El cupo gratuito de R2 publicado es 10 GB-mes, 1 millón de operaciones clase A y 10 millones clase B; al superar el cupo habrá cobro.

## Límites y revisión

Oracle Always Free no garantiza disponibilidad de capacidad ni SLA para esta configuración. Una VM, una zona/volumen y las copias en el mismo proveedor dejan riesgo de caída o pérdida de cuenta; el backup R2 reduce el riesgo de pérdida de datos, pero no aporta recuperación automática. La operación requiere que alguien aplique actualizaciones de seguridad, inspeccione fallos de cron, vigile espacio y ensaye restauraciones.

Antes de aceptar reservas reales: confirmar que la VM se creó como elegible Always Free, comprobar HTTPS y envío SMTP, ejecutar ambos comandos de cron con la configuración productiva, comprobar que `btree_gist` está instalada, restaurar una copia en una base aislada y medir memoria/disco. Si OCI no ofrece capacidad o se necesita disponibilidad/respaldo administrado, pedir presupuesto mínimo; las opciones fiables examinadas dejan de ser gratuitas.

## Fuentes oficiales consultadas

- [Oracle Cloud Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm): compute elegible y cuota de 200 GB de Block Volume, incluidos boot volumes, más cinco backups de volumen.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/): cuota mensual gratuita de almacenamiento y operaciones; el exceso se factura.
- [Railway pricing](https://railway.com/pricing): créditos, límites de Free y cron jobs limitados a la prueba; Hobby desde USD 5.
- [Render free instance limitations](https://render.com/docs/free): Postgres Free expira a 30 días, 1 GB, sin backups; web Free sin disco persistente; no recomendado para producción.
- [Extensiones PostgreSQL de Render](https://render.com/docs/postgresql-extensions): `btree_gist` admitida desde PostgreSQL 13.
- [Render Cron Jobs](https://render.com/docs/cronjobs): ejecución programada, con cargo mínimo mensual por servicio.
- [Fly.io pricing](https://fly.io/pricing/): USD 5 mensuales de uso Free, con base administrada de terceros/extensiones excluidas del Free.

