# API de cuentas web

Worker `zeroed-api` (Hono + D1), independiente del relay cooperativo. Da
cuentas sin contraseña para los productos premium de la web: el jugador pide un
enlace de un solo uso, lo canjea por una sesion y consulta sus permisos. Los
mapas gratis no la usan. Todavia no esta desplegada ni conectada al cliente.

- Rutas en [app.ts](src/app.ts); reglas (caducidades, limites, concesion `*`)
  en [AccountService](src/AccountService.ts); SQL en
  [AccountStore](src/AccountStore.ts) y esquema en [migrations/](migrations/).
- `*` concede todos los productos premium, presentes y futuros; se usa para los
  testers de la beta cerrada.
- Tests: `tests/accountApi.test.ts`, contra SQLite en memoria con las mismas
  migraciones.

## Local

1. Copiar `.dev.vars.example` a `.dev.vars`: los enlaces se imprimen en la
   consola en vez de enviarse.
2. `npm run api:db:migrate:local` y `npm run api:dev` (puerto 8788).

## Primer despliegue (pendiente)

1. `npx wrangler d1 create zeroed-accounts` y copiar su id en `wrangler.jsonc`.
2. Verificar `zeroed.es` en Resend (registros DNS en Hostinger) y guardar la
   clave con `npx wrangler secret put RESEND_API_KEY --config cloudflare/api/wrangler.jsonc`.
3. Aplicar migraciones con `--remote` y desplegar con
   `npx wrangler deploy --config cloudflare/api/wrangler.jsonc`.
4. Testers: `npm run api:seed-beta -- testers.txt > seed.sql` (un correo por
   linea, fuera del repositorio) y
   `npx wrangler d1 execute zeroed-accounts --remote --file seed.sql --config cloudflare/api/wrangler.jsonc`.
