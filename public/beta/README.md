# Acceso de la beta cerrada a mapas premium

Burned Mansion sigue abierto, en individual y cooperativo, sin cuenta. Los
mapas con `product` en [el registro](../../src/config/zombieMaps.ts),
actualmente Station 33 y Die Kathedrale, aparecen con candado mientras la cuenta
no los tenga. Die Kathedrale sigue en desarrollo y aparece como WIP para los
testers de beta. Las cuentas de desarrollo con permiso de prueba pueden jugarla
desde el menu y por enlace directo. La [API de cuentas](../../cloudflare/api/README.md)
concede ese permiso específico al consultar una sesión autenticada.

Los testers ya no se comprueban en el cliente: tienen una concesion `*` en la
[API de cuentas](../../cloudflare/api/README.md), que incluye todo el contenido
premium presente y futuro. La lista de correos no se publica; se carga en la
base de datos con `npm run api:seed-beta` desde un archivo fuera del
repositorio.

Al publicar un producto nuevo del [catalogo](../../src/config/products.ts),
despliega tambien la API de cuentas: esta expande la concesion `*` con los
productos de su version publicada.

Flujo: la tarjeta bloqueada abre [MapUnlockDialog](../../src/ui/MapUnlockDialog.ts),
que ofrece "Continuar con Google" (solo en web, si hay id de cliente) y entrar
con correo y contraseña. "Crear cuenta" cambia al formulario de registro, con la
contraseña repetida; un tester sembrado tambien se registra ahi, sin ir al
correo. Entrar con un correo sin cuenta lleva al registro, y registrar uno que
ya la tiene lleva a entrar, conservando el correo escrito. Al entrar, el juego
carga los productos y, si la cuenta es de beta, muestra
[BetaThanksScreen](../../src/ui/BetaThanksScreen.ts) antes del menu. "¿Has
olvidado la contraseña?" envia un enlace; al abrirlo, el juego inicia sesion y
pide una contraseña nueva; guardarla cierra las demas sesiones de la cuenta. Un
enlace usado o caducado abre el dialogo pidiendo otro. Una cuenta sin el mapa ve su correo y puede cerrar sesion. El boton de
cuenta, arriba a la derecha del menu, muestra la inicial y el correo, con la
placa "BETA TESTER" en cuentas de beta (o "Iniciar sesion"). Si falta espacio,
el correo se acorta con puntos suspensivos. El boton abre el dialogo para
entrar o cerrar sesion, donde se ve la direccion completa de la cuenta.
Los enlaces `?map=station-33` y `?map=die-kathedrale` comprueban el mismo acceso
que el menu. Si falta el permiso, muestran la tarjeta correspondiente bloqueada.

Limites: el codigo de los mapas premium sigue en el paquete del juego, asi que
un cliente modificado puede abrirlos. Como el registro no verifica el correo,
quien conozca el correo de un tester que aun no se ha registrado puede hacerlo
antes que el; el tester lo recupera con el enlace de recuperacion, cuya
contraseña nueva expulsa al otro (entrar con Google da acceso pero no lo
expulsa). Las apps Android y de escritorio solo ofrecen correo y
contraseña.

`vercel.json` redirige las antiguas paginas de beta al juego.

Pruebas en local: con `npm run dev`, los correos de
[LocalTesterBackend](../../src/account/LocalTesterBackend.ts) entran al momento
con cualquier contraseña, al entrar o al registrarse, sin API, con todo el contenido premium y la placa de
beta; el resto de correos sigue el flujo normal. Los builds de produccion no
incluyen ese modulo.

Validacion manual (con la API local o desplegada): en una sesion nueva,
Burned Mansion funciona y ambos mapas premium aparecen bloqueados y no abren por
enlace directo; entrar con un correo de tester sin registrar y comprobar que
lleva a "Crear cuenta"; registrarlo con la contraseña repetida, ver el
agradecimiento y jugar a Station 33 (Die Kathedrale sigue WIP); recargar; cerrar sesion y
comprobar que una contraseña distinta se rechaza y la correcta entra; probar
Google con una cuenta de tester; pedir el
enlace de recuperacion, abrirlo y guardar otra contraseña; probar un correo sin
concesion. Entrar con cada cuenta de desarrollo, abrir Die Kathedrale desde el
menu, salir de la partida y cerrar sesion para comprobar que vuelve el candado
WIP. Repetir en movil, PWA instalada y app Android.
