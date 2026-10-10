# Sistemas del juego

## Flujo de gameplay

```text
Input -> PlayerController -> WeaponInventory -> Weapon
     -> WeaponView / Audio / Effects
     -> Ballistics o EnergyProjectiles -> HitTarget -> ZombiesMode
     -> PlayerHealth / PlayerEconomy / RoundManager
     -> ZombieManager / ZombiePool / ZombieArena / interacciones
```

## Shell compartido

`Input` unifica desktop y tactil. `PlayerController` gestiona camara, recoil,
movimiento, salto y colision opcional. `Weapon` gobierna cadencia, municion,
ADS, recoil y recarga; `WeaponView` muestra el arma sin manos y
`AudioSystem` sincroniza el foley. Las armas de cerrojo (L96) expulsan el
casquillo cuando el cerrojo llega atras, no al disparar, y su foley de
levantar, retroceder, cerrar y bloquear sigue esa misma carrera, tambien en la
recarga vacia. La AK-47 suma a cada disparo el golpe del portacerrojo y su
recarga bascula el cargador sobre el teton delantero con foley propio.
`BallisticsSystem` usa raycast segmentado,
gravedad/drag y pool fijo. Impactos directos: cabeza = 3x; el feedback de
headshot no se duplica en splash ni cadena.

La música usa una pista en bucle durante la partida y comparte otra entre el
menú principal y la pausa. Al pausar se conserva la posición de la pista de
partida; al reanudar continúa desde ese punto. El inicio de ronda se reproduce
como cue independiente sobre la música de fondo.

## Zombies

- Rondas con descanso de 6 s; limite global de 24 activos. `normal` y `shiny`
  usan walker; `brute` usa modelo propio, reserva maxima 2, mas salud, menor
  velocidad y muerte con impacto confirmado. Shiny anade diez estrellas
  reutilizadas; Brutus anade rugido y ataque letal.
- Las rondas 1–5 aplican una rampa de velocidad progresiva (65 %, 72 %, 80 %,
  88 % y 95 %) antes de alcanzar el ritmo normal en la ronda 6. Cada aparición
  recibe velocidad, escala y una fase de marcha independientes para evitar que
  la horda avance como un bloque sincronizado.
- El melee valida distancia XZ, diferencia vertical, linea de ataque, ventana de
  esquiva e instante de impacto. El feedback de dano respeta invulnerabilidad.
- La cabeza usa una hitbox ajustada al craneo. Un headshot concede 150 Points y
  una baja con cuchillo concede 200 Points por su mayor riesgo y dificultad.
- Un arma sin cargador ni reserva permanece equipada: el disparo queda
  bloqueado y una nueva pulsacion reproduce el sonido de encasquillamiento. El
  Knife no ocupa ranura y funciona exclusivamente como melee rapido mediante 3
  (o NUM 3) o el boton KNIFE del HUD tactil, sin cambiar el arma equipada. La
  cuchillada aplica 150 de dano en su contacto visual, tiene 2.05 m de alcance
  y usa el primer collider bajo la mira, por lo que paredes y enemigos cercanos
  bloquean el golpe.
- La navegacion combina steering, A* por planta y anti-stuck. Puertas y
  barreras modifican la topologia; la escalera del bunker es una pendiente
  continua de canal unico, sin teletransporte.
- Pasos: ocho fuentes `PositionalAudio`, reasignadas a los zombies mas cercanos;
  fallback sintetizado si falta el asset.
- Audio direccional (`SpatialCue`): aparicion, inicio del ataque (gruñido o
  rugido del Brute), tablas arrancadas, gemidos ambientales (siempre de un
  zombie vivo) y el golpe recibido suenan desde su origen. Las fuentes a la
  espalda o en otra planta pasan por un paso bajo que las apaga, tambien en
  los pasos, para distinguir delante/detras y arriba/abajo. En cooperativo el
  invitado reproduce las mismas señales a partir de los eventos del anfitrion.
- Animacion: el walker conserva completos los clips originales de idle, marcha
  y muerte del GLB. El mixer sincroniza la marcha con la velocidad y mezcla los
  cambios de estado, mientras una capa aditiva limitada aporta inercia de giro,
  aceleracion e impactos sin reescribir el encorvamiento, braceo o zancada.
- Melee y ventanas usan tres variantes (un brazo por lado y dos manos), con
  anticipacion, contacto a 0.475 s y recuperacion. Los brazos apuntan al blanco
  comprometido, conservan la muneca local y comparten el movimiento de la tabla
  tras el impacto. La ultima tabla continua el ataque sin reiniciar la mezcla.
  Salir del area del golpe durante la anticipacion permite esquivarlo.
- Los cambios de estado mezclan posicion y rotacion desde la pose visible.
  Los impactos leves son aditivos y breves; la muerte conserva impulso y altura
  de planta, con variacion lateral y sin ragdoll. El steering frena los cambios
  de direccion, manteniendo las restricciones de paredes y rampas.

## Mapas e interacciones

- `BurnedMansionArena`: dos plantas, colision, nueve ventanas, puertas por
  Points, wall buys, bunker, pickups, escalera continua y sala secreta.
- Las luminarias ambientales de Burned Mansion emiten rojo y sufren parpadeos
  electricos irregulares y desfasados; las luces funcionales de armas,
  recompensas y objetivos conservan su identidad visual.
- `ZombiesMode` posee run, rondas, salud, economia y progresion; el arena posee
  geometria, colliders, spawns, barreras y puertas.
- Barreras: HP autoritativo, rotura visual independiente y reparacion limitada
  por ronda. Puertas y wall buys cobran de forma atomica. La sala de inicio
  ofrece la M1911 (500) y la L96 (1250) en su pared norte.
- Puertas de pago: el collider es una losa invisible y `BuyableDoorVisual`
  dibuja tablones, cinchas, candado y una placa de precio con brillo pulsante
  en ambas caras. Al comprarla tiembla y estalla en escombros hacia la sala
  nueva; la topologia se abre al instante, sin esperar a la animacion. Suena
  `door_purchase.mp3` (fallback procedural). El bunker sellado usa
  `BunkerDoorVisual`: puerta blindada pintada con volante, cerrojos, mirilla
  roja y marco de peligro con baliza; al abrirse gira el volante, suelta vapor
  y la hoja se esconde dentro del muro antes de liberar la topologia.
- Los golpes a ventanas validan separacion del marco, alineacion lateral y
  linea de contacto. Cada tiron hace vibrar la tabla o la arranca hacia fuera;
  el ultimo completa su recuperacion antes de retomar la ruta de entrada.
  Cada ventana mantiene una cola estable: el mas cercano toma una ventana
  libre y conserva el turno hasta terminar el tiron y atravesar el hueco.
  Los demas esperan en posiciones escalonadas exteriores sin empujar al
  primero ni activar anti-stuck por la espera. La muerte libera el turno;
  las ventanas abiertas conservan el orden de entrada y las reparaciones
  vuelven a detener a quienes aun no han cruzado.
- Mystery Box: 950 Points, revelado a los 5 s; nunca entrega el arma equipada
  al activarla. Ray Gun garantizada a 115 bajas; ZEUS-77 es una tirada
  legendaria de aproximadamente 1 % y encadena objetivos. Ambas usan
  proyectiles de energia. Su cuerpo bloquea al jugador con un collider fijo
  ajustado al tamano y orientacion de la caja, tanto en individual como en
  cooperativo; la tapa animada y el arma flotante no alteran ese volumen.
- La sala secreta activa tres lamparas con USE, reserva almas en vuelo y abre
  una pared una sola vez por run. Las vitrinas del bunker exigen bajas personales:
  Ray Gun, 200 bajas y 6000 Points; ZEUS-77, 300 bajas y 10000 Points.
  Cada vitrina se compra una sola vez por run. El cierre se retrae con un pulso
  de energia al alcanzar el requisito; comprar eleva el cristal y el arma.
  El cooperativo valida las bajas y cobra al comprador en el anfitrion;
  cada cliente muestra su propio progreso y ambos ven la apertura compartida.
  Se conservan la Mystery Box y la recompensa Ray Gun de 115 bajas.
  El comando individual `MOTDRULES` tambien
  abre esa pared sin rellenar los faroles; reiniciar restaura el cierre.
  El final de 30000 Points pasa por
  `PLAYING -> ENDING -> CREDITS -> FINISHED` y detiene gameplay.
  La secuencia nuclear dura 25 s y es CSS puro (transform/opacity, sin bordes
  expuestos): alarma con cuenta atras, detonacion a `NUCLEAR_DETONATION_TIME`
  (flash, bola de fuego, hongo tras la silueta de la mansion y onda
  expansiva). La onda llega a camara (`--impact`, 1.4 s despues) con muro de
  polvo y un temblor fuerte que decae; los creditos esperan ~13 s de
  plano del hongo y la ceniza. El estilo base de cada capa es el fotograma
  final, asi que CREDITS y `prefers-reduced-motion` no saltan. Al terminar
  quedan los creditos y se habilita volver al menu. Sustituye musica/viento y
  arranca `nuclear_alarm.mp3` y `radioactivity.mp3` en bucle;
  `nuclear_explosion.mp3` suena una vez, retrasado para coincidir con el flash.
  Los tres se detienen (y el retraso se cancela) al terminar o salir.
  Individual y ambos clientes cooperativos comparten la secuencia; la ausencia
  de un asset no bloquea el final ni las otras capas. Para incorporar los
  sonidos basta con colocar los MP3 en `public/assets/audio/` y reconstruir
  (en Android, `npm run android:sync`).

## Cooperativo

`CoopHostMode` es la unica autoridad: rondas, spawns, IA y objetivo de los
zombis, daño, muertes, salud, Points, puertas, Mystery Box, reparaciones,
secretos y compras. `CoopGuestMode` solo simula su
propio jugador y arma; recibe `matchState` a 15 Hz y eventos puntuales
(`zombieSpawn/Attack/Hit/Death`, `roundStart/End`, `doorOpened`...).
`ZombieReplica` interpola los zombis en una linea temporal retrasada y nunca
ejecuta IA. Los impactos del invitado son reclamaciones que el anfitrion
valida (`ShotValidator`) y aplica una sola vez; el cuchillo usa el mismo ataque
local que individual y daño autorizado por el anfitrion. Ray Gun y ZEUS-77
dibujan proyectiles en ambos clientes; el anfitrion aplica splash y cadenas.
`CoopWorld` comparte mapa, puertas, tablas, objetivos y final entre ambos roles. El menu de pausa es local y
no detiene la partida. `MULTIPLAYER.md` define el alcance y los limites.

## Rendimiento

Pools conocidos: balistica 32, agujeros 96, casquillos 24, chispas 16, humo 10,
pasos 8 y drops de cargador 12. No se crean objetos en loops criticos; el
perfil de dispositivo limita pixel ratio, sombras y efectos.

Burned Mansion fusiona los 17 peldaños visuales de la escalera en una sola
malla; la rampa caminable solo existe para raycasts y no se dibuja. Mantiene
un presupuesto local estable de luces puntuales: seis en el perfil completo y
cuatro con efectos reducidos. El ranking pondera intensidad nominal (sin el
parpadeo) por alcance y distancia, con histeresis, para iluminar el hueco
desde ambas plantas sin intercambios bruscos.

Los zombis se dibujan opacos y solo pasan a mezcla durante el fundido de
muerte (`rendering/FadeMaterials.ts`); `Game.prepare` precompila esa variante.
Asi una horda solapada en la escalera conserva el descarte por profundidad.

## HUD y estadisticas de partida

El HUD y la pausa consumen la misma instantanea por jugador. La cartera separa
Points disponibles de todos los obtenidos durante la run, incluidas reparaciones;
las compras no reducen el acumulado. ZombieManager notifica la vida realmente
retirada por impactos directos, cuchillo, splash y cadenas, sin contar overkill
ni impactos sobre muertos. En cooperativo el anfitrion atribuye estos datos al
atacante y los replica al invitado. Reiniciar limpia los acumulados.

Los faroles cuentan solo cuando estan llenos de almas (no al activarlos) y el numero real de
interacciones del mapa, con iconos, marcas y etiquetas compartidos entre HUD
y pausa. El HUD de combate usa una presentacion compacta sin leyenda de puntos
ni resumen textual de faroles; la pausa conserva el detalle. Las primeras diez
rondas se representan solo con aranazos. La interfaz no anuncia la sala oculta ni el desbloqueo. Las rondas
combinan aranazos decorativos limitados con el numero exacto para rondas altas.

En dispositivos tactiles el panel permanece pequeno arriba a la derecha, bajo
el boton de pausa, con ronda, puntos, vida y bajas; headshots y faroles se consultan
en la pausa para dejar libre la vista de combate.
