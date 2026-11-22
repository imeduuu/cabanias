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
