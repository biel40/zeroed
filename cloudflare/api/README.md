# API de cuentas web

Worker `zeroed-api` (Hono + D1), independiente del relay cooperativo. Da
cuentas por correo para los productos premium: el jugador entra con Google o con
correo y contraseña, recibe una sesion y consulta sus permisos. Los mapas gratis
no la usan. El cliente la usa mediante `WebAccount`; aun no esta desplegada.

- Rutas en [app.ts](src/app.ts); reglas (caducidades, limites, concesion `*`)
  en [AccountService](src/AccountService.ts); SQL en
  [AccountStore](src/AccountStore.ts) y esquema en [migrations/](migrations/).
- Registro (`POST /auth/register`): crea la cuenta con contraseña, sin
  verificar el correo por decision del usuario. Tambien da contraseña a una
  cuenta que no tiene (testers sembrados, Google o enlace); 409 si ya la tiene.
- Entrada (`POST /auth/password`): nunca crea cuentas; 404 si el correo no
  tiene contraseña y 401 si no coincide. Hash PBKDF2-SHA256 en
  [passwords.ts](src/passwords.ts); 10 fallos por correo o 30 por IP bloquean
  una hora.
- Cambio de contraseña (`POST /me/password`) con la sesion.
- Google (`POST /auth/google`): el cliente envia el ID token de Google Identity
  Services y [googleIdToken.ts](src/googleIdToken.ts) comprueba firma, `aud`,
  emisor, caducidad y correo verificado. Se une a la cuenta del mismo correo.
  Sin `GOOGLE_CLIENT_ID` responde 404 y el juego oculta el boton.
- Recuperacion: `POST /auth/request` envia un enlace de un solo uso; al
  canjearlo (`/auth/verify`) se inicia sesion y el juego pide una contraseña
  nueva, que guarda con `/me/password`.
- `*` concede todos los productos premium, presentes y futuros; se usa para los
  testers de la beta cerrada.
- `ALLOWED_ORIGINS` incluye la web, la app Android (`https://localhost`) y la de
  escritorio (`app://zeroed`).
- Correo de recuperacion en [loginEmail.ts](src/loginEmail.ts). El logo
  (`public/pwa-192x192.png`) y la cabecera animada (`public/assets/email/`,
  generada con `node scripts/generate-email-banner.mjs`) se sirven desde
  `APP_URL`, así que deben estar publicados en la web antes de desplegar un
  correo que los use. `npm run api:preview-email -- es salida.html` lo genera
  con las imagenes locales para revisarlo en el navegador.
- Tests: `tests/accountApi.test.ts`, contra SQLite en memoria con las mismas
  migraciones.

## Local

1. Copiar `.dev.vars.example` a `.dev.vars`: los enlaces se imprimen en la
   consola en vez de enviarse.
2. `npm run api:db:migrate:local` y `npm run api:dev` (puerto 8788).
3. Arrancar el juego contra ella con `VITE_ACCOUNT_API_URL=http://localhost:8788`
   (por ejemplo en `.env.local`) y `npm run dev`.

## Primer despliegue (pendiente)

1. `npx wrangler d1 create zeroed-accounts` y copiar su id en `wrangler.jsonc`.
2. Verificar `zeroed.es` en Resend (registros DNS en Hostinger) y guardar la
   clave con `npx wrangler secret put RESEND_API_KEY --config cloudflare/api/wrangler.jsonc`.
3. Aplicar migraciones con `--remote` y desplegar con
   `npx wrangler deploy --config cloudflare/api/wrangler.jsonc`.
4. Testers: `npm run api:seed-beta -- testers.txt > seed.sql` (un correo por
   linea, fuera del repositorio) y
   `npx wrangler d1 execute zeroed-accounts --remote --file seed.sql --config cloudflare/api/wrangler.jsonc`.

## Google

1. En Google Cloud Console, crear un ID de cliente OAuth de tipo "Aplicacion
   web" con origenes JavaScript `https://www.zeroed.es`, `https://zeroed.es` y,
   para pruebas, `http://localhost:5173` (no hace falta URI de redireccion).
2. Poner ese id (es publico) en `GOOGLE_CLIENT_ID` de `wrangler.jsonc` (o
   `.dev.vars`) y en `VITE_GOOGLE_CLIENT_ID` del build web. Si falta en
   cualquiera de los dos, el juego solo ofrece correo y contraseña.
3. Google no permite su acceso dentro de las apps Android y de escritorio; ahi
   el boton no aparece.
