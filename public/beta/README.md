# Acceso de la beta cerrada a mapas premium

Burned Mansion sigue abierto, en individual y cooperativo, sin cuenta. Los
mapas con `product` en [el registro](../../src/config/zombieMaps.ts),
actualmente Station 33, aparecen con candado mientras la cuenta no los tenga.

Los testers ya no se comprueban en el cliente: tienen una concesion `*` en la
[API de cuentas](../../cloudflare/api/README.md), que incluye todo el contenido
premium presente y futuro. La lista de correos no se publica; se carga en la
base de datos con `npm run api:seed-beta` desde un archivo fuera del
repositorio.

Flujo: la tarjeta bloqueada abre [MapUnlockDialog](../../src/ui/MapUnlockDialog.ts),
que envia un enlace de un solo uso al correo. Al abrirlo, el juego inicia sesion,
carga los productos y, si la cuenta es de beta, muestra
[BetaThanksScreen](../../src/ui/BetaThanksScreen.ts) antes del menu. Una
cuenta sin el mapa ve su correo y puede cerrar sesion. El boton de cuenta, arriba
a la derecha del menu, muestra el correo (o "Iniciar sesion") y abre el mismo
dialogo para entrar o cerrar sesion. `?map=station-33` sin
permiso muestra el menu con la tarjeta bloqueada.

Limites: el codigo de Station 33 sigue en el paquete del juego, asi que un
cliente modificado puede abrirlo. La app Android no puede iniciar sesion: el
enlace se abre en el navegador y su origen no esta permitido en la API.

`vercel.json` redirige las antiguas paginas de beta al juego.

Validacion manual (con la API local o desplegada): en una sesion nueva,
Burned Mansion funciona y Station 33 aparece bloqueado y no abre por enlace
directo; pedir un enlace con un correo de tester, abrirlo, ver el
agradecimiento y jugar; recargar; cerrar sesion desde el boton de cuenta; probar un
correo sin concesion. Repetir en movil y PWA instalada.
