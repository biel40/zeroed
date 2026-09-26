# Modo cooperativo

El modo individual sigue siendo la ruta principal: no abre WebSocket y funciona
sin el servidor de salas. El cooperativo es una opción separada del menú y, en
este modo, admite dos jugadores en Burned Mansion.

## Probar en una máquina

En dos terminales:

```powershell
npm run multiplayer:server
npm run dev
```

Abrir dos ventanas visibles en `http://localhost:5173/` (no dos pestañas de la
misma ventana: el navegador detiene el loop de una pestaña oculta y, si es la
del anfitrión, la partida compartida se congela). En ambas seleccionar **Multiplayer
Mode**. Pulsar **Create Room** en una: el servidor genera el código sin pedir
ningún dato. En la otra, pulsar **Join Room**, introducir el código recibido y
pulsar **Connect**. Después pulsar
**CLICK TO START** en cada pestaña. El servidor local por defecto es
`ws://localhost:8787`, pero el jugador no necesita escribirlo. El anfitrión
puede usar **Copy Code** o **Share** (si el navegador permite
compartir) para enviar el código de sala. Si se abre el
juego desde otro equipo de la misma red, se usa automáticamente el nombre o IP
con que se abrió la página y el puerto `8787`. Las opciones de conexión están
ocultas en la interfaz; se puede configurar el servidor con
`VITE_COOP_SERVER_URL`. La prueba del servidor se ejecuta con
`npm run multiplayer:test-server`.

## Despliegue gratuito: Vercel + Cloudflare

El juego puede seguir en Vercel. El Worker de Cloudflare recibe los WebSockets
en `/multiplayer` y asigna cada codigo de sala a un Durable Object SQLite.
El cliente comprueba la versión del relay antes de crear o unirse a una sala;
si el Worker está desactualizado, muestra un error en el menú en vez de iniciar
una partida sin sincronización. Tras cambiar el protocolo, desplegar primero el
Worker y después la web.
No se necesita crear los objetos a mano: la configuracion `wrangler.jsonc`
registra la clase `CoopRoom`, y Cloudflare crea cada instancia al usar un codigo.

1. Crear una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up)
   y activar el subdominio gratuito `workers.dev` en **Workers & Pages**.
2. Ejecutar `npm install` y `npx wrangler login` desde este repositorio. El
   login abre el navegador para autorizar Wrangler con tu cuenta.
3. Ejecutar `npm run multiplayer:cloudflare:deploy`. Wrangler publica el Worker
   y muestra una URL como `https://zeroed-multiplayer.<subdominio>.workers.dev`.
4. En Vercel, añadir la variable de entorno
   `VITE_COOP_SERVER_URL=wss://zeroed-multiplayer.<subdominio>.workers.dev/multiplayer`
   para el entorno Production y volver a desplegar el proyecto. La variable
   Vite se incorpora al frontend durante la compilacion.
5. Abrir la web de Vercel en dos navegadores: crear sala en uno y unirse con el
   codigo en el otro. Verificar tambien que el modo individual funciona sin red.

Para probar el Worker localmente, ejecutar `npm run multiplayer:cloudflare:dev`
y, en otra terminal, iniciar Vite con
`$env:VITE_COOP_SERVER_URL='ws://localhost:8787/multiplayer'; npm run dev`
(PowerShell). Con Wrangler activo en el puerto 8787, ejecutar
`npm run multiplayer:cloudflare:test` para probar el protocolo. El relay Node.js
sigue disponible para desarrollo.

El plan Workers Free admite Durable Objects con almacenamiento SQLite, sujeto
a los limites gratuitos de Cloudflare. El servidor usa WebSocket Hibernation
para que las salas inactivas no mantengan ejecucion continua. No guarda partidas
ni cuentas; al desconectarse el anfitrion se cierra la sala.

## Otra conexión por Internet

El servidor `server/multiplayer.mjs` es un proceso Node.js que debe permanecer
activo y ser accesible para ambos jugadores. Puede ejecutarse en un equipo
propio, sin contratar un servicio. En una web HTTPS el navegador exige una
dirección `wss://`; hace falta terminar TLS delante del proceso Node.js.
La dirección se puede fijar al compilar con `VITE_COOP_SERVER_URL` (por ejemplo,
`VITE_COOP_SERVER_URL=wss://relay.example.com/multiplayer`). Si no se configura,
la web HTTPS intentará conectar a `/multiplayer` en su propio dominio, por lo
que el proxy debe enviar esa ruta al proceso Node.js. Alguien debe mantener
ese proceso accesible para ambos jugadores.
El código de sala evita que otro jugador entre por accidente, pero no es
autenticación ni cifrado adicional. No se guardan cuentas ni partidas.

## Alcance y límites

- Salud cooperativa: un jugador a 0 HP entra en `DOWNED` durante 20 s. El
  compañero puede usar E/USE a menos de 2 m; el anfitrión valida una única
  transacción de 2 s, la cancela si pierde alcance o estado y devuelve 40 % de
  salud. Al agotarse el tiempo pasa al flujo `DEAD` existente. El snapshot
  replica estado, cuenta atrás y progreso; el gesto de manos, golpe y cámara
  baja se reproducen localmente. El protocolo del relay es la versión 6:
  desplegar el Worker antes que el frontend actualizado.
  El alcance se mide desde el cuerpo tumbado; la posición validada del invitado
  caído permanece utilizable mientras siga conectado aunque su ventana deje
  de enviar movimiento en segundo plano.

- Autoridad única: el navegador anfitrión (`CoopHostMode`) simula rondas,
  spawns, IA y objetivo de los zombis, daño, muertes, salud, Points y puertas.
  El servidor solo empareja y reenvía mensajes; nunca reenvía los mensajes
  reservados del propio relay (`peerJoined`, `peerLeft`...). El invitado
  (`CoopGuestMode`) solo simula su jugador y su arma (la munición es del
  jugador) y valida cada mensaje entrante (`Protocol.ts`).
- Red y render son independientes: durante la partida activa el anfitrión emite `matchState` a 15 Hz y
  el invitado `playerState` a 20 Hz. Zombis y compañero se interpolan con un
  retraso fijo (`Interpolation.ts`), sin extrapolar. Los eventos puntuales
  (`zombieSpawn`, `zombieAttack`, `zombieHit`, `zombieDeath`, `roundStart`,
  `roundEnd`, `doorOpened`, `playerDamaged`, `matchRestart`) llevan IDs
  únicos por spawn; los que refieren entidades desaparecidas se ignoran.
  En espera, final y créditos se envían solo cambios puntuales; una sala sin
  invitado no envía estados periódicos al relay.
- Combate: el anfitrión aplica todo el daño. Las balas del invitado vuelan en
  local (impactos y hitmarker inmediatos), pero un impacto a zombi es una
  reclamación que el anfitrión acepta una sola vez por disparo validado
  (`ShotValidator`: cadencia máxima y un crédito por disparo, según el arma).
  El cuchillo reutiliza el ataque del modo individual; el anfitrión valida
  alcance, cadencia, daño y puntos de cada impacto del invitado.
- Arsenal especial: la Mystery Box cobra 950 Points al jugador que la activa,
  muestra la misma tirada a ambos y reserva el resultado para ese comprador.
  L96 usa la balistica compartida. Ray Gun y ZEUS-77 muestran proyectiles en
  ambos clientes; el anfitrión resuelve impactos, splash y cadenas y atribuye
  cada baja al tirador. El desbloqueo de Ray Gun a 115 bajas es individual.
- Arsenal: ambos empiezan con la M1911 y pueden llevar dos armas. Las compras
  de pared de Burned Mansion (AK-47, M4A1 y M60) cuestan puntos individuales;
  el anfitrión valida la compra y confirma el arma al invitado. La munición
  también puede reponerse en la pared con el precio del modo individual.
- Puertas: empiezan cerradas; el anfitrión valida la puerta, cobra solo al
  comprador, la abre para ambos y la difunde. Quien se une recibe las puertas
  abiertas sin pagar. Las tablas de barricada se replican del anfitrión.
- Burned Mansion: la reparación de barricadas se valida por alcance y premia
  al jugador que repara. Las lámparas, almas, pared secreta, ritual y vitrinas
  del búnker forman parte del estado compartido. Las vitrinas solo se compran
  una vez y cobran al comprador. La recarga de munición es individual. El
  final de 30000 Points detiene la partida compartida y abre los créditos.
- La pausa del invitado solo abre su menú y libera el ratón; la partida sigue.
  La pausa del anfitrión detiene la simulación para ambos hasta que reanuda.
  Solo el anfitrión puede reiniciar;
  el invitado vuelve a la nueva partida automáticamente. Si sale el invitado,
  el anfitrión continúa solo y los zombis cambian de objetivo; si entra otro
  invitado recibe el estado completo. Si sale el anfitrión, la sala termina y
  el invitado conserva el menú para salir. Volver al menú no recarga la página.
- No hay migración de anfitrión ni recuperación de inventario del invitado
  tras una desconexión. La munición del invitado se ejecuta en su cliente; el
  anfitrión valida cadencia y propiedad de armas, pero no replica cargadores.
- El compañero es un cuerpo animado sin cámara, input ni HUD. El soldado final
  es un GLB con esqueleto y clips (`public/assets/players/soldier.glb`, ver
  `ASSETS.md`); mientras falte se usa un cuerpo procedural de reserva con
  brazos en postura de disparo y pistola sujeta a la mano derecha. Ambos
  jugadores aparecen frente a frente en la sala inicial.
- La suite cubre dos modos reales conectados por un relay en memoria
  (`tests/coopMatch.test.ts`): rondas, combate, puertas, desconexión y
  reinicio. Sigue haciendo falta prueba manual con Pointer Lock real, latencia
  de Internet y Android.
