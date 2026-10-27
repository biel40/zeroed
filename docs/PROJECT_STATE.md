# Estado del proyecto

**Corte:** 2026-10-25. La fuente de verdad es el codigo actual.

## Funcional

- Entrada WebGL, selector de mapas con tarjetas ilustradas (Burned Mansion
  incluido; Station 33 premium, solo individual, en acceso anticipado para la
  beta y con sus Fases 1 a 4 jugables: el vestibulo, la consigna, las
  cocheras con los trenes abandonados y la sala de maquinas con el
  interruptor general que ilumina todo el mapa), carga de
  assets con fallback y shell FPS
  compartido desktop/tactil. No hay pagos: premium solo es presentacion.
- Armas declarativas, balistica segmentada, energia, headshots, recargas,
  economia, rondas, Mystery Box, wall buys, barreras, puertas y pickups.
- Consola de desarrollador en individual: activar `MOTDRULES` y abrir con F2.
  Permite equipar armas, conceder anillos, reponer municion, multiplicar dano
  y desactivar invencibilidad para pruebas. Pausa al escribir y reinicia sus
  ajustes con la partida; `help` muestra los comandos.
- Inspeccion de arma con F (solo escritorio): giro de flancos y, en fusiles y
  subfusiles de cargador de caja o tambor y en la M1911, comprobacion del cargador
  con sus balas restantes. Cerrojo, cinta y armas de energia solo giran.
- PPSh-41 con tambor de 71 balas, disponible en la Mystery Box y en la pared
  del vestibulo de Station 33 en el lugar de la Vector; la Vector sigue en la caja.
- Barrett .50 semiautomatico con modelo procedural propio estilo M82A1 (cajon de
  techo plano con carril completo, guardamanos perforado, freno en flecha de dos
  camaras, culata maciza con apoyacara y monopie plegado, cerrojo visible por la
  ventana, remaches de chapa estampada, nervios en la camisa, palanca del
  cargador y alza delantera abatida) y mira telescopica,
  disponible en la Mystery Box en individual y cooperativo (7 balas y 40 de reserva).
  Station 33 tambien lo ofrece gratis una vez por partida en un baul con candado
  numerico en el puesto de milicia; reiniciar cierra el baul y repone el arma.
  Se sobrecalienta y bloquea tras cuatro disparos rapidos, destroza a los zombis
  en pedazos, atraviesa hasta cinco zombis en linea y admite un MP3 propio (`barrett_shot.mp3`, aun no incluido).
- ФАКЕЛ-33, lanzallamas experimental exclusivo de Station 33: se compra (3500)
  en el armario de descontaminacion de la sala de maquinas con la electricidad
  encendida, tras recuperar el cristal de arranque de un portador de la horda
  e instalarlo gratis en el armario; alli se reponen sus cristales (1750).
  El portador lleva un gran marcador rojo y energia orbital; el HUD guia cada
  paso con direccion y distancia. El desafio se reinicia con la partida.
  Chorro continuo de 9 m que
  quema hasta doce zombis por tick y los deja ardiendo 4 s, con tres cristales
  de repuesto; se bloquea tras 4 s de fuego continuo y su recarga cambia el
  cristal rojo del nucleo. Sus victimas mueren calcinadas: se retuercen, caen
  encogidas, la piel se carboniza con brasas y dejan un charco de sangre.
- Anillos (perks) en individual: el de Resurreccion se compra en la consigna
  de Station 33, se ve en el anular, salva una muerte y se recarga. El de
  Prestidigitacion (menique, recargas al doble de velocidad) esta en las
  cocheras pero exige electricidad: el interruptor general de la sala de
  maquinas la enciende, y un rayo de la ZEUS-77 contra la taquilla la
  alimenta 60 s. El de Armadura (corazon, rojo, vida maxima doble, 2500)
  tambien exige electricidad y esta en el puesto de milicia, tercera salida
  del vestibulo (puerta de 3000), junto a la AK-47 en pared. Al comprar un
  anillo, las manos se lo ponen con una animacion.
- Zombies normal/shiny/brute con pool global 24, navegacion con A* y anti-stuck,
  melee validado, pasos 3D y ZEUS-77 legendaria. La Ray Gun se entrega a
  115 bajas solo en Burned Mansion. En
  Station 33 los walkers visten uniformes sovieticos (guerra y guerra fria) o
  ropa de evacuado mediante skins por mapa.
- Burned Mansion con dos plantas, bunker, escalera continua, progresion pagada,
  nueve ventanas y sala secreta de lamparas/almas. Final de 30000 Points.
- PWA instalable, cache runtime y actualizacion diferenciada entre navegador y
  standalone. Capacitor prepara distribucion Android.
- Música diferenciada para partida y menú/pausa, con reanudación de la pista de
  partida desde su posición anterior y cue independiente al iniciar ronda.
- Ajustes accesibles en cualquier momento (menú principal y pausa): volúmenes,
  sensibilidad, eje Y invertido y campo de visión, guardados en el dispositivo.
- Cooperativo privado de dos jugadores en Burned Mansion: autoridad del
  anfitrion, servidor de salas WebSocket, replica de jugadores/zombis, arsenal
  completo, Mystery Box y progresion compartida de mapa. El modo
  individual conserva su ruta local y offline. Ver `MULTIPLAYER.md`.
- Caida y reanimacion cooperativas autoritativas con sangrado de 20 s,
  interacción E/USE, salud parcial, cuerpo caído y gesto de manos.
- Relay Cloudflare Worker con Durable Object por sala preparado para despliegue;
  el frontend Vercel apunta al Worker mediante `VITE_COOP_SERVER_URL`.

## Limitaciones y bugs abiertos

- Acceso temporal de beta en el navegador: los correos autorizados de `public/beta/emails.js` entran directamente,
  sin API ni verificacion por correo. Es un filtro visual, no autenticacion.
  Codigo y guia de retirada en `public/beta/`.
  Tras introducir un correo autorizado se muestra una bienvenida cinematica
  saltable, con agradecimiento, feedback por correo y opcion de compartir.

- No hay pruebas de WebGL, DOM real, Pointer Lock, fullscreen, audio real ni
  flujo end-to-end. PWA y offline requieren validacion manual en HTTPS.
- Antes del primer START la simulacion puede avanzar; game over tactil aun
  puede recibir movimiento/disparo.
- Barreras totalmente destruidas no siempre entran en reparacion; el cambio de
  arma tactil debe cancelar reparacion.
- RESTART necesita reset verificable de toda la run. Distancias de impacto y
  fade vertical de cadaveres tienen casos pendientes.
- El registro de colliders dinamicos necesita consolidacion.
- Energia aun se distingue por color. Existen flags de debug que deben
  blindarse o retirarse.
- La suite de tests puede contener expectativas antiguas de headshots o casos
  de navegacion no deterministas.
- Cooperativo de dos jugadores: las puertas empiezan cerradas y el
  anfitrion cobra solo al comprador. La municion del invitado sigue en su
  cliente; faltan pruebas manuales de sesiones reales con latencia. El compañero usa
  `public/assets/players/soldier.glb` con fallback procedural. Falta validar
  juego completo entre navegadores con Pointer Lock, latencia y Android.

## Fuente complementaria

`V0.9.md` conserva el resumen historico de esa version; `ROADMAP.md` ordena el trabajo; `ARCHITECTURE.md`
describe fronteras; `GAME_SYSTEMS.md` describe runtime; `PWA.md` y
`ANDROID_DOCS.md` describen distribucion.
