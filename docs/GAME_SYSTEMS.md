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
ADS, recoil y recarga; `WeaponView` muestra el arma, `ViewArms` las manos que la sujetan y
`AudioSystem` sincroniza el foley. Arma, brazos y cuchillo comprimen su
profundidad (`applyViewModelDepth`) para no atravesar paredes al pegarse a
ellas; sus materiales no deben compartirse con objetos del mundo. Las armas de cerrojo (L96) expulsan el
casquillo cuando el cerrojo llega atras, no al disparar, y su foley de
levantar, retroceder, cerrar y bloquear sigue esa misma carrera, tambien en la
recarga vacia. La AK-47 suma a cada disparo el golpe del portacerrojo y su
recarga bascula el cargador sobre el teton delantero con foley propio.
`BallisticsSystem` usa raycast segmentado,
gravedad/drag y pool fijo. Impactos directos: cabeza = 3x; el feedback de
headshot no se duplica en splash ni cadena.

Jugador y zombis vivos se bloquean con volumenes cilindricos estables, separados
de las hitboxes animadas. El movimiento comprueba el trayecto y permite rodear
los cuerpos y salir de solapamientos por aparicion o correcciones de red; la
altura evita colisiones entre plantas. Los muertos dejan de bloquear al instante.
Individual y anfitrion usan la poblacion local; el invitado, las replicas visibles.

La música usa en bucle durante la partida la pista que declara el mapa y comparte
otra entre el menú principal y la pausa. Al pausar se conserva la posición de la pista de
partida; al reanudar continúa desde ese punto. El inicio de ronda se reproduce
como cue independiente sobre la música de fondo.
Station 33 usa «Creepy Halloween Music», de Tunetank (Pixabay), como pista propia;
Burned Mansion conserva su música de partida. Los créditos y el origen del asset
se recogen en `ASSETS.md`.

Los ajustes del jugador (`PlayerSettings`: volumen general, efectos y música,
sensibilidad, sensibilidad al apuntar, eje Y invertido y campo de visión) se
abren desde el menú principal o la pausa y se aplican al instante. El volumen
de efectos escala el bus de `AudioSystem` y el listener de los pasos; el de
música, cada pista de `MusicManager`. La sensibilidad al apuntar multiplica la
propia de cada arma y el campo de visión solo cambia la vista sin apuntar.
Mientras el diálogo está abierto, ESC lo cierra sin reanudar la partida.
«Guardar» confirma los valores actuales y cierra el panel; los cambios siguen
guardandose automaticamente al ajustarlos.

## Zombies

- Rondas con descanso de 6 s; limite global de 24 activos. `normal` y `shiny`
  usan walker; `brute` usa un modelo derivado del walker, reserva maxima 2,
  mas salud, menor velocidad y muerte con impacto confirmado. Shiny anade diez
  estrellas reutilizadas; Brutus anade ojos rojos, rugido, ataque letal y paga
  el doble por cada baja (cuerpo, headshot o cuchillo).
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
  cuchillada es un tajo lateral de derecha a izquierda: el arma equipada baja
  sujeta por la mano izquierda, la derecha suelta la empunadura y vuelve con el
  cuchillo (que solo existe fuera de pantalla), cruza la pantalla con el filo
  por delante y el golpe se resuelve
  cuando la hoja pasa por la mira. Tiene 2.05 m de alcance y usa el primer
  collider bajo la mira, por lo que paredes y enemigos cercanos bloquean el
  golpe; el arco visible no es un ataque de area.
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
- Animacion: aparicion y marcha son los clips originales del GLB; el idle
  tecnico y las muertes se hornean por codigo sobre el mismo rig una vez por
  modelo (`ZombieMotionClips`). El mixer sincroniza la marcha con la velocidad
  y mezcla los cambios de estado, mientras una capa aditiva limitada aporta
  inercia de giro, aceleracion e impactos sin reescribir el encorvamiento,
  braceo o zancada.
- Melee y ventanas usan tres variantes (un brazo por lado y dos manos), con
  anticipacion, contacto a 0.475 s y recuperacion. Los brazos apuntan al blanco
  comprometido, conservan la muneca local y comparten el movimiento de la tabla
  tras el impacto. La ultima tabla continua el ataque sin reiniciar la mezcla.
  Salir del area del golpe durante la anticipacion permite esquivarlo.
- Los cambios de estado mezclan posicion y rotacion desde la pose visible.
  Los impactos leves son aditivos y breves. El steering frena los cambios de
  direccion, manteniendo las restricciones de paredes y rampas.
- Muertes segun el golpe letal (`ZombieDeath`), sin ragdoll: cuchillo (gira,
  se sujeta el corte y cae de lado), pistola y L96 (retrocede y cae de
  espaldas), automaticas (sacudidas por cada impacto y se desploma de bruces),
  headshot con arma de fuego (se derrumba inerte), Ray Gun (vaporizacion de
  1.0 s con `RayGunDissolveShader`, borde incandescente verde y cenizas
  ascendentes) y Tesla (convulsiona rigido y cae). Un disparo por la espalda lo
  tumba hacia delante y los impactos laterales giran la caida hacia el empuje.
  La pose viva se funde con la caida conservando la inercia de la marcha; el
  cuerpo llega al suelo con impacto y, hasta aterrizar, nunca vuelve a subir
  (si las rodillas tocan el suelo lo sostienen hasta que se desploma). Al morir se retiran al instante los colliders y el estado A*/colas de barrera;
  el anfitrion replica estilo y lado del impacto.
- Cada zombie alcanzado por la cadena ZEUS-77 queda cargado 2.8 s
  (`ZombieElectricArcs`): rayos que saltan entre sus articulaciones y un
  destello azul en la piel, vivo o ya caido en el suelo. Es solo visual (un
  draw call por cuerpo cargado, sin luces) y el anfitrion envia los IDs
  alcanzados en `teslaChain`.

## Mapas e interacciones

- `BurnedMansionArena`: dos plantas, colision, nueve ventanas, puertas por
  Points, wall buys, bunker, pickups, escalera continua y sala secreta. Es el
  unico mapa cooperativo. Su ambientacion es una casa victoriana quemada sobre
  un bunker de defensa civil: papel damasco, zocalo de nogal y parquet
  carbonizados, vigas a la vista, madera que aun humea (brillo emisivo que
  respira), lamparas de laton arriba y apliques enjaulados abajo, ceniza,
  brasas y humo bajo el techo, y un jardin muerto con arboles, tumbas y verja
  tras las ventanas. Las texturas se hornean en codigo
  (`shared/ProceduralSurface`, compartido con Station 33) con UV ancladas al
  mundo para que el patron continue entre trozos de muro. La arena orquesta;
  la decoracion vive en `maps/burnedMansion/`, nunca es solida y no cambia la
  geometria jugable.
- `Station33Arena`: individual y premium, se construye por fases y crece hacia
  el norte y hacia abajo segun el plan de ejes de `Station33Config`. La Fase 1
  es el vestibulo: cuatro entradas con chapas de acero (escalera de superficie,
  puerta de servicio y dos rejillas), la AK-47 y la Vector (900 / 625) en pared
  y la escalera mecanica sellada. La Fase 2 es la consigna, tras una puerta de pago de chapa (750) en
  el muro este: dos entradas mas, que solo generan zombis con la puerta
  abierta, la MP5 (1000 / 500) en
  pared, la Mystery Box y la taquilla del
  anillo de Resurreccion. Las rejillas este del vestibulo se separaron para
  dejar un pasillo de 5,8 m. Un unico rectangulo de `playerBounds` y de navegacion cubre
  ambas salas: muros y la puerta cerrada son lo que impide el paso. Reiniciar
  cierra la puerta y duerme la zona. Aun no tiene final. La arena solo
  orquesta: cada zona tiene su builder en `station33/`, y la luz y la
  atmosfera son sistemas propios. Direccion de arte y directrices del mapa:
  `STATION_33.md`.
- Puertas de pago de Station 33: la misma `PointDoorView`/`BuyableDoorVisual`
  que la mansion con chapas de acero en lugar de tablones y superficie de
  impacto metalica.
- Los fluorescentes de Station 33 parpadean por circuitos desfasados (colores
  de materiales compartidos, sin luces nuevas). Megafonia, tren lejano y
  apagon son eventos de datos del mapa con temporizador
  (`AmbientEventScheduler`) y voz procedural en `AudioSystem`; un `sampleFile`
  en el evento la sustituye por un MP3 de `public/assets/audio/`.
- Un mapa puede declarar una intro (`ArenaIntro`: planos de camara,
  duracion y presentacion del HUD). `ZombiesMode` la reproduce una sola vez
  al empezar la partida (no al reanudar ni reiniciar) con `IntroCinematic`,
  cuya camara renderiza el shell sin arma ni brazos; la ronda no avanza hasta
  que termina, y el ultimo plano aterriza en los ojos del jugador. Se salta
  con cualquier tecla (tras 0.6 s), con el boton tactil o al pausar.
  La de Station 33 (8 s) arranca a oscuras con solo la luz de emergencia, un
  tren hace temblar la boveda, los circuitos se encienden uno a uno y la grua
  recorre la nave mientras aparece el titulo premium dorado.
- El menu principal muestra una tarjeta por mapa con arte SVG animado, nombre,
  lema, jugadores y acceso (incluido o premium, con brillo dorado y aviso de
  acceso anticipado); `HUD` rellena jugadores y acceso desde el registro. La
  pantalla de carga y la pausa nombran el mapa elegido. `?map=<id>` sigue
  disponible como atajo de pruebas.
- Las luminarias ambientales de Burned Mansion emiten rojo y sufren parpadeos
  electricos irregulares y desfasados; las luces funcionales de armas,
  recompensas y objetivos conservan su identidad visual.
- `ZombiesMode` posee run, rondas, salud, economia y progresion; el arena posee
  geometria, colliders, spawns, barreras y puertas.
- Barreras: HP autoritativo, rotura visual independiente y reparacion limitada
  por ronda. Puertas y wall buys cobran de forma atomica. La sala de inicio
  ofrece la M1911 (500) y la L96 (1250) en su pared norte.
- Cada barrera conoce la altura de su alfeizar (`WindowBarrierConfig.sill`;
  0 en las puertas de Station 33). Un zombi que empieza a cruzar desde fuera
  una ventana abierta con alfeizar la trepa (`WindowVault`): se encorva, apoya
  las manos, sube la cadera por encima del borde y amortigua la caida. Es solo
  visual, depende de su posicion y no frena el avance; la replica cooperativa
  lo reproduce igual con las barreras de su arena.
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
- Mystery Box: 950 Points, revelado a los 5 s; nunca entrega ninguna de las
  dos armas que lleva el comprador al activarla, en individual y cooperativo.
  Ray Gun garantizada a 115 bajas; ZEUS-77 es una tirada
  legendaria de aproximadamente 1 % y encadena objetivos. Ambas usan
  proyectiles de energia. Su cuerpo bloquea al jugador con un collider fijo
  ajustado al tamano y orientacion de la caja, tanto en individual como en
  cooperativo; la tapa animada y el arma flotante no alteran ese volumen.
- La sala secreta activa tres lamparas con USE, reserva almas en vuelo y abre
  una pared una sola vez por run. Su circulo ritual dispara un susto unico:
  las velas se apagan, el circulo estalla en rojo y una aparicion emerge y se
  lanza contra la camara local antes de desaparecer de golpe. El sonido sigue
  los mismos tiempos (`RITUAL_SCARE_TIMELINE`); en individual el impacto
  sacude la camara. Las vitrinas del bunker exigen bajas personales:
  Ray Gun, 200 bajas y 6000 Points; ZEUS-77, 300 bajas y 10000 Points.
  Cada vitrina se compra una sola vez por run. El cierre se retrae con un pulso
  de energia al alcanzar el requisito; comprar eleva el cristal y el arma.
  El cooperativo valida las bajas y cobra al comprador en el anfitrion;
  cada cliente muestra su propio progreso y ambos ven la apertura compartida.
  Se conservan la Mystery Box y la recompensa Ray Gun de 115 bajas.
  Easter egg del bunker: la ultima mascara de gas de la pared norte
  (`ArenaGasMaskRack`) se pone y se vuelve a colgar con USE. Es cosmetica y
  solo individual (`ZombiesGasMask`): la mano derecha la lleva a la cara como
  un `MeleeArmDriver`, el arma baja y no dispara durante la animacion, y el
  visor SVG del HUD cierra la vista con vaho al respirar.
  El comando individual `MOTDRULES` fija Ray Gun y ZEUS-77 con reserva infinita
  en ambas ranuras y tambien abre esa pared sin rellenar los faroles; reiniciar
  restaura el cierre y el inventario inicial.
  El final de 30000 Points es el que declara la mansion (`MANSION_NUCLEAR_ENDING`) y pasa por
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

## Anillos

Los anillos son las perks de Zeroed: un anillo por dedo, cada uno con un dedo
fijo en su `RingDefinition` (`src/game/rings/RingCatalog.ts`), que guarda
precio, recarga, cargas y los parametros de su efecto como dato.
`PlayerRings` es el estado puro de la run (anillos llevados, cargas y
`pendingEvents`). `ZombiesRings` (en `src/modes/`) vende y recarga en las
`ringMachines` opcionales del mapa con la cartera comun, dispara los efectos y
mantiene en sintonia mano, maquinas y HUD; `ZombiesMode` solo le delega la
interaccion (tras las recargas de municion y antes del final y la caja), el
prompt, la muerte y el reinicio.

- Resurreccion (anular, 1 carga): tres compras por run a precio doble cada vez
  (500, 1000 y 2000; las recargas cuentan), despues la taquilla queda vacia.
  Un golpe letal con carga gasta el anillo en lugar de terminar la run:
  devuelve el 50 % de la vida, sacude la camara, destella la pantalla en frio
  y suena un latido. El jugador cae de rodillas y tarda 1,2 s en levantarse
  (solo puede mirar: ni moverse, ni disparar, ni interactuar). Desde que el
  anillo se dispara hasta 2,5 s despues de ponerse en pie esta protegido: es
  invulnerable y los zombis lo ignoran (`ZombieManager.ignoreHost`: se quedan
  quietos, sus golpes en curso fallan y quien trabaja una barrera sigue con
  ella). Una vineta azul, espejo de la roja de vida baja (que se oculta
  mientras tanto), cubre exactamente ese tiempo y parpadea durante el ultimo
  segundo para avisar del final. Sin carga, el flujo de muerte no cambia.
- Las maquinas suenan como las de bebidas: `ZombiesRings` sigue cada frame a
  la mas cercana en la planta del jugador y `AudioSystem.setRingJingle`
  mantiene un unico bucle (volumen, paneo y apagado por distancia y
  orientacion, sin allocations), callado en intro, pausa, derrota y final.
  `ring_machine_jingle.mp3` sustituye al tono procedural si existe.
- El anillo se ve en el dedo de la mano derecha en primera persona
  (`HandRings`, hijo del hueso de la falange, sin tocar la pose ni subir nunca
  hacia la mira); brilla con su esmalte al ponerselo y al dispararse y se apaga
  gastado. `Game.prepare` los muestra todos para compilar sus shaders.
- El HUD muestra iconos compactos por anillo (tambien en movil) y la pausa,
  nombre, dedo y estado; un anillo gastado se atenua.
- `MOTDRULES` no concede anillos: con invencibilidad nunca se gastarian. Con
  sus compras ilimitadas se pueden comprar gratis y reiniciar los retira.
- Solo individual: el cooperativo no los usa.

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
pasos 8 y drops de cargador 12. No se crean objetos en loops criticos.

`DeviceProfile` fija una calidad Baja/Media/Alta: la elegida en Ajustes
desde el menu principal (guardada en `localStorage`) o, sin eleccion, la detectada (Baja en
moviles con poca memoria, Media en moviles, equipos modestos o con movimiento
reducido, Alta en el resto). La calidad decide pixel ratio maximo (1/1,5/2),
efectos reducidos, anisotropia y luces puntuales; los controles tactiles
siguen dependiendo solo del dispositivo. Se aplica al empezar la siguiente
partida. Durante el juego, `DynamicResolution` baja la resolucion por pasos
del 10 % (minimo 50 %) si la media de un segundo cae de 50 fps, y la sube al
recuperar 57 fps; un intento de subida fallido duplica la espera del
siguiente y una bajada que no acelera el frame se deshace, porque el cuello
no era la GPU. `?debug` muestra la escala actual.

Station 33 mantiene visibles solo las luces puntuales que caben en ese mismo
presupuesto (`POINT_LIGHT_BUDGET`): las de la sala donde esta el jugador, por
prioridad, y las de la otra para completar; el cambio de sala espera a que el
jugador cruce claramente la puerta. Fusiona su decoracion estatica en una
malla por material (`StaticMeshBatch`); columnas, torniquetes, taquillas,
mostrador, carro y bancos chocan con proxies AABB invisibles.

Burned Mansion fusiona los 17 peldaños visuales de la escalera en una sola
malla; la rampa caminable solo existe para raycasts y no se dibuja. Mantiene
un presupuesto local estable de luces puntuales segun la calidad: seis en
Alta, cuatro en Media y tres en Baja. El ranking pondera intensidad nominal (sin el
parpadeo) por alcance y distancia, con histeresis, para iluminar el hueco
desde ambas plantas sin intercambios bruscos. Su decoracion estatica se
fusiona por material y por planta (`MansionDecorBatch`); cada malla guarda su
particion para que la ocultacion por plantas siga funcionando.

El renderer solo descarta por frustum, asi que el mapa saca de la capa de
camara las mallas visuales que pertenecen a una sola planta cuando el jugador
no puede verlas; desde la sala de la escalera solo conserva la franja de la
otra planta visible a traves del hueco. Colliders y luces nunca cambian de
capa: los raycasts tambien filtran por capas y alterar el numero de luces
activas recompilaria los shaders.

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

La pantalla de derrota muestra la ronda alcanzada y permite reintentar el mapa
o volver al menu principal. En cooperativo solo el anfitrion puede reintentar;
el invitado puede volver al menu o esperar al reinicio del anfitrion.
