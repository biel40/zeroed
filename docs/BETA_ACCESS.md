# Beta cerrada temporal

Vercel protege la web y sus archivos mediante `middleware.js`. Los correos
autorizados reciben un enlace firmado (valido durante 15 minutos) y una
cookie HttpOnly de siete dias. Cada peticion vuelve a comprobar la lista;
retirar un correo revoca sus sesiones en el nuevo despliegue. El enlace puede
reutilizarse hasta caducar: no hay base de datos ni cuentas.

## Configuracion de Vercel

Configurar estas variables privadas y desplegar de nuevo:

| Variable | Valor |
| --- | --- |
| `BETA_ENABLED` | `true` para activar; `false` para abrir la web |
| `BETA_ALLOWED_EMAILS` | Correos separados por comas; nunca usar prefijo `VITE_` |
| `BETA_SITE_URL` | Origen HTTPS de la web, por ejemplo `https://zeroed.es` |
| `BETA_SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `BETA_GMAIL_APP_PASSWORD` | Contrasena de aplicacion del Gmail `biel40aws@gmail.com`, como en zeroed-landing |

El listado proporcionado por el propietario esta en `.env.beta.local`, ignorado
por Git. No contiene claves. Vercel no lo recibe: trasladar los valores a las
variables del proyecto. La integracion reutiliza el patron de `zeroed-landing`:
Nodemailer con `smtp.gmail.com:465`, TLS y remitente `biel40aws@gmail.com`.
No depende del checkout de la landing ni necesita Resend ni un dominio de correo.
Configurar la misma variable privada en el proyecto Vercel del juego; las
variables de la landing no se comparten automaticamente. Usar una contrasena
de aplicacion con verificacion en dos pasos, nunca la contrasena habitual de Gmail.

La build deriva su control de acceso de `BETA_ENABLED`. Cambiarlo requiere
una nueva build, tambien al retirar la beta. Desarrollo normal y Android
mantienen el arranque habitual si esta variable no esta activa. Las previews
necesitan su propio `BETA_SITE_URL` si se habilita la beta en ellas.

## Solicitudes

`Solicitar acceso` envia el correo del interesado a `biel40aws@gmail.com`.
No anade participantes automaticamente. Para aprobarlo, actualizar
`BETA_ALLOWED_EMAILS`, desplegar y avisarle de que puede entrar.
El remitente es `biel40aws@gmail.com`; el interesado figura en Reply-To.
El correo indicado en una solicitud no esta verificado.

Configurar una regla de rate limiting en Vercel para `POST /api/beta` antes de
publicarlo, para evitar abuso del formulario y consumo de la cuota de Gmail.
El campo trampa y los botones deshabilitados durante el envio no sustituyen un
limite por IP. La respuesta confirma aceptacion SMTP, no entrega final en la
bandeja de entrada. Gmail puede limitar envios o rechazar conexiones.

## PWA y alcance

La build de beta no registra el Service Worker y exige una comprobacion online
antes del arranque. La pantalla de acceso retira los workers y caches de
Zeroed del navegador. Una copia anterior completamente descargada puede seguir
funcionando offline antes de visitar la nueva web; no se puede revocar ese
codigo ya entregado. El relay cooperativo de Cloudflare queda fuera de este
control; su URL no concede acceso a los archivos de la web.

## Validacion

`npm run beta:test` prueba firmas, caducidad, revocacion, rutas protegidas,
cookie, solicitudes y fallos de envio. `npm run build` comprueba la build
habitual; `npm run build -- --mode beta` comprueba la build cerrada con el
archivo local. `vite dev` no ejecuta middleware ni funciones de Vercel: para
validar el flujo completo usar un despliegue de preview con sus variables o
`vercel dev`. Verificar envio real, entrada, rechazo, solicitud y revocacion
en HTTPS antes de activar produccion.

Referencia de despliegue: [Vercel middleware](https://vercel.com/docs/routing-middleware).
