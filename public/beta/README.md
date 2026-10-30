# Acceso temporal a mapas de beta

Burned Mansion sigue abierto, en individual y cooperativo. Los mapas marcados
con `betaOnly` en [el registro](../../src/config/zombieMaps.ts), actualmente
Station 33, requieren introducir en el menu un correo de `BETA_EMAILS` en
`emails.js`. No hay distincion entre desarrolladores y testers ni excepcion
en Vite dev. `premium` sigue siendo solo presentacion.

`access.js` reutiliza la clave `zeroed.betaAccess` en `sessionStorage` y valida
el correo contra la lista cada vez que se consulta el permiso. Las sesiones
anteriores con correos aun autorizados siguen siendo validas. El menu y el
arranque de partida comparten `canAccessZombieMap`: `?map=station-33` sin
permiso muestra el menu; al aceptar el correo, abre el mapa solicitado.
Si no se puede leer o guardar la sesion, Station 33 permanece restringido.

Es el mecanismo local de la beta anterior: **no verifica la titularidad del
correo ni proporciona autenticacion de servidor**. La lista y la comprobacion
se descargan al cliente; alguien puede introducir un correo ajeno autorizado
o manipular el cliente. Para restringir por identidad real hace falta otro
sistema de autenticacion.

`src/main.ts` mantiene la PWA activa. `BETA_ENABLED` y `VITE_BETA_ENABLED` no
controlan este permiso. En Vercel, `vercel.json` redirige solo las antiguas
paginas de beta al juego, conservando la consulta; `access.js` y `emails.js`
deben servirse como archivos, sin redireccion.

Al aceptar un correo, [BetaThanksScreen](../../src/ui/BetaThanksScreen.ts) muestra
una tarjeta de agradecimiento sobre capturas de `public/assets/beta/`; el mapa
solicitado se abre al cerrarla. Al recargar con un acceso ya guardado no vuelve
a aparecer.

Validacion manual: comprobar en una sesion nueva que Burned Mansion funciona
y Station 33 no aparece ni abre por enlace directo; probar un correo ajeno a
la lista y uno autorizado (tarjeta de agradecimiento), recargar la misma pestaña y regresar al menu tras
una partida. Repetir en movil y PWA instalada, y comprobar los enlaces antiguos
de beta. Las copias antiguas offline necesitan actualizarse con conexion.
