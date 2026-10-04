# Acceso temporal

Con `BETA_ENABLED=true`, el arranque muestra la pantalla de mantenimiento.
Introducir cualquiera de los correos de `emails.js` y pulsar Continuar permite
entrar sin verificar el correo. El listado contiene los seis participantes originales.
La comprobacion ocurre en el navegador, sin peticiones de autenticacion,
servidor de correo, claves ni enlaces de verificacion. El permiso se recuerda
en `sessionStorage` para esa pestaña.

Tras aceptar un correo se muestra `welcome.html`: una bienvenida de tres escenas
con captura del mapa, transiciones suaves, agradecimiento y acciones para enviar
feedback o compartir el enlace de Zeroed. Se puede omitir o avanzar manualmente;
la ultima escena espera a que el jugador pulse Jugar. Con movimiento reducido
las escenas solo avanzan manualmente. No modifica el gameplay ni necesita API.
Las entradas posteriores al menu con permiso recordado evitan la bienvenida.

Para dar o retirar acceso, editar la lista `BETA_EMAILS` en `emails.js` y volver
a desplegar. Mantener un correo por linea, en minusculas. Tambien se comprueba
la lista al recuperar el permiso de una pestaña; retirar un correo invalida
ese permiso cuando se carga la nueva version.

Otros correos muestran la opcion Solicitar acceso, que abre la aplicacion de
correo con un mensaje a `biel40aws@gmail.com`. El usuario debe enviarlo.

Es un filtro visual temporal: el correo y el permiso son publicos y se puede
eludir desde el navegador. No verifica la identidad ni protege los archivos.

`npm run beta:dev` permite probarlo en `http://localhost:5174/beta/index.html`.
La configuracion local de beta solo contiene `BETA_ENABLED=true`.
Para Vercel, configurar esa variable antes de compilar. Para retirar la
pantalla, cambiarla a `false` y desplegar una nueva build. Los antiguos
parametros de SMTP, lista privada y firma ya no se utilizan.

La beta no registra el Service Worker. La pantalla retira las caches anteriores
de Zeroed cuando el navegador lo permite. Las copias ya descargadas pueden
seguir funcionando offline; la version Android mantiene su build habitual
cuando `BETA_ENABLED` no esta activo.

## Organizacion y retirada

El codigo especifico de esta funcion vive en `public/beta/`: pantalla
`index.html`, listado en `emails.js`, comprobacion y permiso de la pestaña en `access.js`, y sus tipos
en `access.d.ts`. `src/main.ts` solo conecta esa comprobacion al arranque.

Para desactivarla sin borrar codigo, poner `BETA_ENABLED=false` y desplegar.
Para eliminarla definitivamente:

1. Quitar de `src/main.ts` el import de `hasBetaAccess` y la rama de beta;
   conservar `setupPWA()` antes de iniciar `ZeroedBoot`.
2. Borrar `public/beta/`.
3. Retirar `beta:dev` de `package.json`, el `define` de beta y el import
   `loadEnv` de `vite.config.ts`, y las variables de entorno de beta.
4. Quitar la referencia a esta funcion en `docs/PROJECT_STATE.md` y actualizar
   los apartados de beta de `public/privacy.html`.
