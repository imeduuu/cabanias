# Respaldos y restauración

## Respaldo

El respaldo es un archivo PostgreSQL en formato custom, comprimido y fechado en UTC (`<base>_YYYYMMDDTHHMMSSZ.dump`). Se crea con `pg_dump` y se puede inspeccionar o restaurar con `pg_restore`.

Instala las herramientas cliente de PostgreSQL de la misma versión principal del servidor y guarda los archivos en una carpeta de respaldo fuera del servidor de aplicación. Como destino, usa almacenamiento independiente con cifrado en reposo y acceso restringido (por ejemplo, un bucket privado de otro proveedor o una unidad externa cifrada). No guardes la única copia en el servidor, en el volumen de la base ni en el repositorio. Conserva la cadena de conexión en un gestor de secretos; no la pongas en el historial del shell.

Define `BACKUP_DATABASE_URL` con la URL PostgreSQL de la base que decidiste respaldar y ejecuta:

```sh
npm run db:backup -- /ruta/externa/respaldos
```

Programa una copia diaria y una adicional antes de cambios importantes. Conserva 30 copias diarias y 12 cierres mensuales, verificando periódicamente que los archivos se puedan restaurar. La política de retención del almacenamiento debe borrar las copias vencidas sin tocar las vigentes.

## Restauración

La restauración elimina/recrea los objetos contenidos en el archivo (`--clean --if-exists`). Requiere que indiques la URL completa del destino de forma explícita y que confirmes escribiendo exactamente `RESTAURAR <nombre_de_base>`. No usa `DATABASE_URL` ni selecciona un destino por defecto. Aísla primero la aplicación y confirma que la URL identifica la base que quieres reemplazar.

```sh
RESTORE_TARGET_URL='postgresql://usuario:clave@servidor:5432/base_destino?sslmode=require' \
RESTORE_CONFIRMATION='RESTAURAR base_destino' \
npm run db:restore -- /ruta/externa/respaldos/cabanias_20261127T120000Z.dump
```

En PowerShell, define esas mismas variables con `$env:RESTORE_TARGET_URL` y `$env:RESTORE_CONFIRMATION` antes de ejecutar el comando. No uses una URL pooled si el proveedor recomienda un endpoint directo para restauraciones. `pg_restore` reporta error si falla algún objeto; corrige primero los errores de compatibilidad/extensiones antes de permitir tráfico a la base restaurada.

## Prueba de restauración

`npm run test:postgres` crea el respaldo custom de `cabanias_test`, lo restaura en un contenedor PostgreSQL desechable y comprueba la presencia de los seis triggers de dominio y de las dos restricciones `EXCLUDE USING gist`. Además intenta solapar bloqueos y verifica que la restricción restaurada rechace el intervalo. El contenedor y el archivo temporal se eliminan al terminar, incluso si la prueba falla. Requiere Docker y el servicio local de pruebas configurado por el proyecto.
