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

`Input` unifica desktop, tactil y mando estandar del navegador. `PlayerController` gestiona camara, recoil,
movimiento, salto y colision opcional. C alterna agachado/de pie y Z tumbado/de pie;
el boton tactil AGACH. usa la misma accion (en tactil no hay boton para tumbarse).
En tactil, los botones redondos rodean FUEGO, elevado bajo el pulgar derecho:
FUEGO mantiene apuntar y disparar con una pulsacion, y APUNT. fija o suelta el
ADS con cada toque. ARMA queda en un anillo exterior encima del grupo, fuera del
barrido lateral de la camara. Las posturas bajas
reducen velocidad y altura de colision; la camara y el compañero aceleran y
frenan gradualmente al cambiar de postura, conservando continuidad al invertir
la transicion. Para
levantarse debe caber el cuerpo bajo los obstaculos; Espacio desde una postura
baja intenta levantarse sin saltar. No se cambia de postura en el aire, caido,
muerto ni con los controles bloqueados. El comportamiento es compartido entre
individual y cooperativo. `Weapon` gobierna cadencia, municion,
ADS, recoil y recarga. La M1911 tiene una patada vertical marcada, con un golpe
visual de elevacion y retroceso y una recuperacion que deja sentir cada disparo.
La dispersion de cadera favorece el combate cercano; apuntar reduce tanto el
cono base como el bloom acumulado, segun `spread` de cada
[definicion de arma](../src/config/weapons.ts). En automatico, cada bala suma
un pequeno incremento hasta `maxBloom`; `bloomRecoveryDelay` conserva esa
perdida entre disparos y, tras la pausa, `bloomRecovery` la reduce gradualmente.
Las rafagas cortas conservan mas precision que el fuego sostenido y una pausa
breve no borra el bloom restante. En semiautomatico la recuperacion empieza
sin esa espera, tambien con la repeticion del boton tactil. El calor conserva
su penalizacion propia. La dispersion modifica la trayectoria real y cada
evento de disparo conserva su cono antes de sumar el bloom de esa bala, incluso
si varias balas salen en un frame. Estas reglas se comparten entre escritorio,
Android y cooperativo; la capacidad y el acabado KOVKA no las alteran.
El recoil de camara (`RecoilController`) se acumula hasta un tope
(`recoil.maxClimb`, `DEFAULT_MAX_RECOIL_CLIMB` si falta): una rafaga larga sin
compensar se estabiliza en vez de llevar la vista al techo. Mover la vista contra
el retroceso (raton, tactil o mando) consume el recoil pendiente sin cambiar la
vista de ese frame, asi la recuperacion nunca baja la mira por debajo de donde la
llevo el jugador. El muelle visual del arma (`SpringRecoil`) integra en subpasos
fijos y se asienta igual a cualquier tasa de frames. En fuego automatico
sostenido cada bala lo patea algo mas (`SustainedFireKick`, hasta un tope) y el
extra se disipa suavemente al soltar el gatillo.
El recoil de apuntado (incluido `recoil.cameraJolt`) mueve la camara antes de
resolver los disparos; los efectos solo visuales (`CameraShake`, vibracion del
lanzallamas, destello de las armas de energia, empujon al reanimar) se aplican
despues, asi que nunca desvian la punteria. En Ajustes > Accesibilidad,
`cameraShake` escala o desactiva esos efectos visuales y `weaponKick` la
sacudida del arma en las manos; ninguno cambia recoil de apuntado, dispersion ni
dano.
En individual y cooperativo, cada jugador empieza con seis cargadores de ocho
balas para la M1911, incluido el que lleva puesto.
`WeaponView` muestra el arma, `ViewArms` las manos que la sujetan y
`AudioSystem` sincroniza el foley. La palma y el pulgar de primera persona
comparten una superficie cosida, continua al cambiar de agarre y nivel de detalle.
Arma, brazos y cuchillo comprimen su
profundidad (`applyViewModelDepth`) para no atravesar paredes al pegarse a
ellas; sus materiales no deben compartirse con objetos del mundo. Las armas de cerrojo (L96 y M40) expulsan el
casquillo cuando el cerrojo llega atras, no al disparar, y su foley de
levantar, retroceder, cerrar y bloquear sigue esa misma carrera, tambien en la
recarga vacia. La recarga de la AK-47 bascula el cargador sobre el teton
delantero con foley propio. La
M1911 queda con la corredera abierta tras la ultima bala y su recarga vacia la
suelta de ese bloqueo; el cargador vaciado cae sin su bala superior. El M14
(`locksOpenWhenEmpty`) hace lo mismo con su varilla de operaciones, que ademas
se mueve con cada disparo, y bascula su cargador recto como la AK-47.
La PPSh-41 intercambia su tambor de 71 balas con la misma coreografia; al
recargar vacia tira del cerrojo hasta engancharlo atras, sin un cierre hacia delante.
Toda recarga sigue la misma vitrina (`ReloadAnimator`), ajustada por arma en
`reloadAnim`: `swapPose` sube el arma y gira el cambio hacia el ojo,
`rackPose` muestra la palanca o el cerrojo en la recarga vacia y `wellDepth`
fija cuanto recorre un cargador de caja para salir y donde se alinea el nuevo,
que se ensena entero antes de entrar. La mano lo sujeta desde la base
(`hands.magazine`) y los golpes (encaje, tapa, cierre de la accion) suenan en
el mismo fotograma del impacto.
Las balas superiores del cargador (`reloadParts.rounds`, `MagazineRounds`) solo
se dibujan con el cargador fuera y muestran las que lleva: el vaciado sale sin
ellas y el nuevo las ensena llenas.
Solo en escritorio, F inspecciona el arma (`Weapon.inspect`, `InspectAnimator`):
la levanta por su flanco derecho, la gira al izquierdo y, en cargadores de caja
o tambor y en la M1911 (`rifle`, `rock`, `drum`, `pistol`), saca el cargador con la mano de apoyo para
ensenar sus balas antes de encajarlo. Es solo visual y local: no toca la
municion, y disparar, apuntar, recargar, cambiar de arma, el cuchillo o un menu
la interrumpen sin retrasar la accion.
Las armas automaticas se recalientan con fuego sostenido (`BarrelHeat`, dato
`heat` de la definicion): rafagas cortas no lo notan, pero asoma en poco mas
de un segundo de fuego continuo; al pasar del umbral la punta del cañon (o de
la camisa que lo oculta, `heat.glow`, como en la PPSh-41) brilla de rojo a
naranja (`BarrelGlow`), la boca suelta mas
humo y sigue humeando hasta enfriarse (`BarrelSmoke`) y la dispersion crece
hasta `maxSpreadBonus`. Se enfria tras una breve pausa sin disparar y vuelve a
frio al equipar o reiniciar la municion. Es solo local: el companero no lo ve.
Un `heat.lockout` bloquea el gatillo al llegar al maximo hasta enfriarse del
todo (evento `overheated`: siseo y chasquido en cada intento); `heat.coolDelay`
retiene el calor entre disparos para que un semiautomatico lo acumule. La M14
lo usa sin bloqueo: un cargador disparado muy seguido (menos de 0.4 s entre
disparos) la calienta, y el tiro pausado no. El
Barrett lo usa: cuatro disparos seguidos (menos de 1.3 s entre ellos, su
cadencia maxima) lo bloquean hasta enfriarse. `requireAdsToFire` solo deja
disparar con la mira completamente subida; el gatillo desde la cadera no gasta
municion ni emite eventos. El Barrett lo usa. `audio.sampleFile` sustituye el disparo procedural por
una grabacion de `public/assets/audio/`. La L96 salta la entrada del clip
(`audio.sampleOffset`) para alinear el estampido con el disparo. La AK-47 usa
una grabacion de tiro unico con una cola mas larga en semiautomatico y un
corte corto (`audio.autoSampleFile`) por cada bala en automatico. La M14 usa
un disparo de G3 del mismo calibre con la cola
atenuada para el tiro semiautomatico rapido. [Grabacion CC0 de areniporgen](https://freesound.org/people/areniporgen/sounds/712577/).
La MP5 y la PPSh-41 tambien usan disparos grabados. En automatico reproducen
un golpe corto por bala para que la cola no se acumule.
[Fuentes de audio](../ASSETS.md#audio-publicassetsaudio).
`audio.variation` permite variar ligeramente el tono y la ganancia por disparo. Si el clip aun no esta
disponible, suena el procedural. `recoil.cameraJolt` y `recoil.playerPush`
anaden a un arma pesada un golpe seco de camara y un leve empuje hacia atras
del jugador. La L96 levanta el canón con fuerza y desplaza al jugador unos
9 cm por disparo en reposo. El Barrett lo desplaza unos 14 cm. `muzzleSmoke` suelta nubes
de humo a ambos lados de la boca (fuera de la linea de mira), mas duraderas,
y agranda las volutas de recalentamiento; el Barrett lo usa y su bloqueo dura
unos 4.5 s.
`muzzleFlash` da a la L96 y al Barrett una llamarada frontal con nucleo
brillante y un golpe de luz mas intenso sobre el entorno. El Barrett tambien
lanza chorros laterales por las dos camaras del freno de boca.
El Barrett expulsa una vaina .50 propia (`shellCasing`), de unos 10 cm,
con cuello hueco; cae de lado y permanece visible 4 s en el pool de casquillos.
Un arma de llama (`flame` en la definicion, la ФАКЕЛ-33) no pasa por la
balistica: cada disparo es un tick del chorro que `ZombiesFlames` resuelve en
el modo. Quema a los zombis vivos de la planta del jugador dentro de su cono y
alcance (`FlameTargeting`), con linea de vision (paredes y puertas cerradas lo
cortan), y los deja ardiendo unos segundos (`ZombieBurns`: mordiscos cada
0,25 s, con tolerancia al redondeo del reloj, se refresca sin acumularse y nunca muerde un cadaver).
La ФАКЕЛ-33 basica conserva el dano directo, la cadencia, el cono y el combustible;
su quemadura aporta dos ticks directos de dano durante tres segundos, de modo
que barrer una horda de rondas medias exige mantener el consumo para rematarla.
Valores y auditoria en la [nota de equilibrio](changes/fakel-balance.md);
su propuesta KOVKA quedo sustituida por la forja letal descrita en Station
33 (arma forjada: los zombis que toca mueren al instante). Cada ignicion
nueva paga un impacto; bajas y dano son los del arma. Muere con su propio
estilo (`burn`): se arana la cara en llamas, cae de rodillas y se desploma
de bruces encogido como un cadaver calcinado; el fuego lo envuelve, la piel
se carboniza a trozos hasta quedar negra con grietas de brasas que respiran
y quemaduras en carne viva (`ZombieCharShader`, encadenado al shader de
disolucion, sin recompilar), suben chispas y ceniza (las particulas de la
VORTEX-9 en naranja) y un charco de sangre se extiende bajo el cuerpo
(`ZombieBloodPool`). Quemarse vivo ya oscurece la piel. El chorro vive en el mundo (`FlameJet`): una vara presurizada de unos 3 m,
blanca con nucleo azul y dos helices carmesi del cristal girando a su
alrededor, que se rompe en bolas de fuego (`FlameParticles`, pools fijos,
la mitad con efectos reducidos). Cada bola conserva la punteria con la que
salio, asi que al barrer el fuego se curva y se arrastra; frenan, se hinchan
y suben al final del alcance, se aplastan contra la pared que corta el
chorro, sueltan humo aceitoso y chispas en estela. Encender lanza una bola
de fuego. Seis draw calls mientras arde y ninguna al apagarse; sin luces
nuevas: la luz de boca del shell se adelanta 2,6 m y parpadea como fuego,
cada tick sacude un poco la camara y el arma vibra en las manos. Y
cada cuerpo ardiendo lleva unas lenguas de fuego sobre sus articulaciones
(`ZombieFlames`, un draw call por cuerpo, que siguen en el cadaver mientras
dura la quemadura). El rugido es un bucle (`FlameStreamLoop`) con
encendido explosivo, gruñido de horno ondulante, crepitacion escasa, corte y
siseo de la boquilla caliente, que
el shell alimenta solo con un arma de llama y silencia al pausar. Un
`heat.warning` avisa antes del bloqueo (silbido) y anuncia cuando vuelve a
poder disparar (`cooledDown`: chasquido y piloto que se reenciende); las
demas armas con bloqueo no lo usan. La recarga `crystal` abre la jaula
(`cover`), saca el cristal gastado (cae al mundo apagado), mete uno nuevo,
cierra y reenergiza el nucleo en cada recarga, tactica o vacia.
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

Bajo la música, cada mapa puede declarar un fondo procedural
(`ArenaAmbience.ambientBed`: viento en Burned Mansion, zumbido de red a 50 Hz y
rumor de tuneles en Station 33) que entra y sale con fundido. Fondo y eventos
ambientales del mapa pasan por un bus propio de `AudioSystem`: al morir el
ultimo zombi suena un toque de campana grave y el ambiente baja a un silencio
tenso durante el descanso; al empezar la ronda siguiente vuelve
gradualmente, sin efecto sintetico: el unico cue audible es el MP3 de ronda. `RoundCueGate` garantiza un unico cue de inicio y de fin por ronda
en individual y en ambos clientes cooperativos, y se reinicia con la partida.
La pausa silencia el bus y ocultar la pagina (cambio de pestaña o de app)
suspende el contexto de efectos hasta volver. Los gemidos de zombi (aparicion y
ambientales) comparten un cupo de voces simultaneas con huecos reservados para
los cercanos, de modo que una horda no apila decenas de gruñidos.
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

### Mandos

Los sticks ofrecen movimiento analogico y camara con velocidad angular basada
en delta, sin exigir Pointer Lock. Los ajustes de mando son independientes de
raton/tactil y se guardan en `PlayerSettings`; incluyen activacion, velocidad
horizontal/vertical, zonas muertas radiales, inversion vertical y multiplicador
ADS. Las acciones usan los mismos handlers y validaciones del shell y los modos.
Las asignaciones se mantienen en
[GamepadBindings](../src/player/GamepadBindings.ts): X/□ recarga y LB/L1
interactua. Tienen botones separados para conservar la reparacion mantenida y la
reanimacion existentes. La cruceta derecha lanza la granada letal (G en
teclado). No hay sprint.

Cruceta o stick izquierdo recorren los controles visibles del menu o dialogo
activo; confirmar activa el control nativo, volver cancela el dialogo o regresa
al menu anterior, e izquierda/derecha ajustan los deslizadores. Los campos de
texto conservan la entrada nativa. Los prompts cambian segun la ultima entrada
significativa y muestran etiquetas PlayStation/Xbox si el identificador permite
reconocer la familia, o numeros de boton genericos. La conexion por si sola no
cambia el dispositivo de presentacion. Menu/Options en otro mando estandar
selecciona ese dispositivo local.

Desconectar libera solo el estado del mando; sin Pointer Lock ni controles
tactiles, abre la pausa local. Perder foco o visibilidad tambien pausa la partida local. Los
botones mantenidos al cerrar menus o recuperar foco necesitan soltarse; los
sticks deben volver al centro. Los layouts no estandar no generan acciones y
se indican en Ajustes. Las pruebas automatizadas usan snapshots simulados;
compatibilidad fisica, audio y experiencia en navegador siguen pendientes de
validacion manual. Detalles de entrega y comprobacion en
[soporte nativo de mando](changes/native-gamepad.md).

### Consola de desarrollador

El comando individual `MOTDRULES` fija VORTEX-9 y ZEUS-77 con reserva infinita
en ambas ranuras y tambien abre esa pared sin rellenar los faroles; reiniciar
restaura el cierre y el inventario inicial. En Station 33, el panel del
Protocolo 33 ofrece ademas abrir la salida al momento por su precio (10000),
sin electricidad, interruptores ni defensa: empieza la huida con su reloj y
hay que subir al patio, vencer al guardian y usar el camion
(`EvacuationProtocol.skipToEscape`).
Al activarlo aparece el [HUD de rendimiento](#hud-de-rendimiento). Reiniciar lo oculta salvo si la
URL incluye `?debug`. F2 abre una consola local de desarrollador que pausa la
partida; Esc/F2 cierra y reanuda por el flujo de pointer lock habitual.
El panel ofrece selectores de armas y anillos, botones de municion y
proteccion, y un multiplicador de dano con restauracion. Cada accion
explica su efecto y muestra el resultado; la escritura de comandos queda
en un desplegable avanzado y utiliza la misma validacion.
`help`, `weapons` y `rings` muestran la ayuda y los catalogos actuales.
`weapon <id>` equipa incluso con las ranuras fijadas por modo Dios;
`ring <id>` (alias `drink`) concede o recarga los anillos sin consumir
compras ni exigir maquinas del mapa. `boss` (tambien con boton) abre gratis
la salida del mapa y coloca al jugador donde despierta su guardian; la
entrada, el duelo, la extraccion y el final son los reales, y solo funciona
mientras el guardian duerme. `forge` (alias `kovka`, tambien con boton)
enciende la electricidad, abre gratis las puertas hasta la maquina de
mejora del mapa (`ZombieArena.prepareUpgradeMachineVisit`) y coloca al
jugador delante, mirandola; con `MOTDRULES` forjar no cuesta puntos.
`ammo full|infinite` afecta al arma
equipada, `damage <1-100>` fija su multiplicador de dano (incluye area de
VORTEX-9 y cadenas ZEUS) y `invincible on|off` permite probar salud y
resurreccion; `stats on|off` muestra u oculta el
[HUD de rendimiento](#hud-de-rendimiento). No es un sistema de mejora comprable: son ajustes temporales
de prueba, reiniciados con la run. Historial con arriba/abajo y `clear`
para limpiar la salida. Solo individual, disponible con el mismo acceso
existente a `MOTDRULES`.

## Zombies

- La vida conserva la curva de las rondas 1–5 y suma 35 HP por ronda desde
  la 6, sin techo fijo; los multiplicadores de tipo siguen aplicandose.
  ZEUS-77 descarga 450 de dano sobre hasta seis objetivos, con saltos de 5 m;
  solo la cabeza del impacto directo multiplica el dano. VORTEX-9 hace 400
  de dano directo y hasta 600 de area en 2,5 m con caida lineal. Individual
  y cooperativo usan el mismo balance.
- Rondas con descanso de 6 s; limite global de 24 activos. `normal` y `shiny`
  usan walker; `brute` usa un modelo derivado del walker, reserva maxima 2,
  mas salud, menor velocidad y muerte con impacto confirmado. Shiny anade diez
  estrellas reutilizadas; Brutus anade ojos rojos, rugido, ataque letal y paga
  el doble por cada baja (cuerpo, headshot o cuchillo).
- Skins del walker (`src/zombies/skins/`): cada mapa declara en
  `ZombieArena.zombieSkins` los aspectos de su horda, que se reparten por turnos
  entre los cuerpos del pool. Una skin recolorea regiones del atlas (camisa,
  mangas, guantes, muslos, espinillas, pies) con un multiplicador por vertice y
  funde accesorios rigidos (gorras, cascos, capuchas, cinturones, correas, equipo) en
  la misma malla, pesados a un solo hueso: sigue siendo un draw call, no hay
  texturas nuevas y la altura de contrato no cambia. Una skin tambien puede
  quemar el cuerpo (manchas chamuscadas y carbonizadas por ruido determinista,
  cara incluida; ojos, boca y sangre intactos) y perder un antebrazo, cuyo
  codo se cierra con una tapa plana al ras del corte y deja de seguir al hueso
  perdido ([dano de skin](../src/zombies/skins/ZombieSkinDamage.ts)).
  Burned Mansion viste asi a toda su horda. Se construyen una vez por
  walker cargado. Solo apariencia: tipo, hitboxes y animacion son los del walker.
  El primer impacto en la cabeza desprende gorras, ushankas y cascos completos,
  con sus insignias; las capuchas y el resto del equipo siguen puestos. El gorro
  cae desde la pose actual, gira, rebota y queda en el suelo o sobre los solidos
  cercanos usando las colisiones de restos existentes. Se conserva hasta retirar
  ese cuerpo del pool y vuelve a colocarse al reutilizarlo. El invitado cooperativo
  reproduce el efecto tambien en las bajas de un disparo.
  `ZombieArena.zombieEyes` cambia el color de ojos de todos los modelos del mapa
  (`ZombieModelSource.eyes`); sin el, cada modelo usa el suyo.
- Horda ponderada: en lugar de `zombieSkins`, un mapa puede declarar
  `ZombieArena.zombieSkinShares` (una skin, o `null` para el walker sin vestir,
  con un peso). Cada spawn de walker tira su aspecto con el rng del manager y
  saca un cuerpo libre que lo lleve ([selector](../src/zombies/ZombieLookPicker.ts));
  si no queda ninguno libre usa cualquier walker libre. Los cuerpos del pool se
  reparten entre los aspectos en proporcion a los pesos, con al menos uno cada
  uno. Solo apariencia: no cambia tipo, vida, velocidad ni dano.
- Vestiduras largas ([prendas](../src/zombies/skins/ZombieClergyGarments.ts)):
  habitos, albas, casullas, sobrevestas, velos y cofias se funden en la misma
  malla. Por encima de la cadera la tela copia los pesos del torso bajo ella;
  por debajo reparte parte del peso entre ambos muslos, asi que la falda se abre
  entre las piernas al andar sin fisica de tela
  ([drapeado](../src/zombies/skins/ZombieGarmentDrape.ts)). Las piernas bajo la
  falda se tinen del mismo tejido para que un roce no se lea como piel. Una skin
  con `stains` ensucia su ropa con sangre seca y barro desde el bajo. La mitra
  es el unico tocado de estas skins que cae con el primer disparo a la cabeza.
  Las prendas con patron muestrean un atlas procedural compartido
  ([patrones](../src/zombies/skins/ZombieGarmentPatterns.ts)): tejido, bajos
  rasgados con desgarros reales, bordado de hilo de oro, encaje calado, cota de
  malla y cuerda, tenidos por el color de vertice, y tres brocados (lirios sobre
  azul, roleos sobre negro, cruces sobre carmesi) que llevan su propio oro. El atlas copia la paleta del
  walker, asi que el cuerpo sigue en el mismo material y draw call; un alpha test
  bajo recorta rasgaduras y encaje sin cortar el fundido de muerte.
- Las rondas 1–5 aplican una rampa de velocidad progresiva (65 %, 72 %, 80 %,
  88 % y 95 %) antes de alcanzar el ritmo normal en la ronda 6. Desde esa
  ronda, Station 33 acerca un 8 % las apariciones de cada ronda normal
  (`STATION33_WAVE_PACING`); el resto de mapas y el cooperativo mantienen la
  cadencia compartida. Cada aparición
  recibe velocidad, escala y una fase de marcha independientes para evitar que
  la horda avance como un bloque sincronizado.
- El melee valida distancia XZ, diferencia vertical, linea de ataque, ventana de
  esquiva e instante de impacto. El feedback de dano respeta invulnerabilidad.
  El golpe conecta a los 180 ms, con los brazos sincronizados al impacto y la
  cadencia entre ataques conservada. Las barricadas mantienen su golpe a 475 ms.
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
  cuando la hoja pasa por la mira. Al retirarse el cuchillo, el arma vuelve
  suavemente a su posicion durante la recuperacion, con las manos siguiendo
  sus agarres, en individual y cooperativo. Si el cuchillazo empieza durante
  una recarga, la interrumpe y devuelve las piezas y la mano de apoyo al arma:
  no modifica cargador ni reserva. Mientras dura el ataque no se inicia otra
  recarga. Si el cargador estaba vacio, se inicia automaticamente al terminar
  el cuchillazo; una recarga tactica se vuelve a solicitar con R.
  El barrido frontal abarca 100 grados y
  alcanza 1,8 m, con asistencia vertical sobre los cuerpos. Cada ataque elige
  un solo objetivo, priorizando la mira y despues la alineacion y proximidad;
  paredes y cuerpos interpuestos bloquean cada trayectoria. La seleccion y
  validacion del invitado comparten estas reglas. Conserva dano por ronda,
  cadencia y recompensa. El tajo cruza mas alto y mas ancho, con hoja biselada,
  vaciado longitudinal y empunadura nervada.
- La navegacion combina steering, A* por planta y anti-stuck. Puertas y
  barreras modifican la topologia; la escalera del bunker es una pendiente
  continua de canal unico, sin teletransporte. La rejilla se reconstruye en
  cada cambio de barrera, asi que cada obstaculo solo marca las celdas a su
  alcance (mismo predicado exacto, coste proporcional al area ocupada).
- Pasos: ocho fuentes `PositionalAudio`, reasignadas a los zombies mas cercanos;
  fallback sintetizado si falta el asset.
- Audio direccional (`SpatialCue`): aparicion, tablas arrancadas y gemidos
  ambientales (siempre de un zombie vivo) suenan desde su origen. Las fuentes a la
  espalda o en otra planta pasan por un paso bajo que las apaga, tambien en
  los pasos, para distinguir delante/detras y arriba/abajo. En cooperativo el
  invitado reproduce las mismas señales a partir de los eventos del anfitrion,
  y cada cliente oye los disparos del compañero desde su posicion
  (`playRemoteShot`: solo la detonacion, sin mecanismo ni cola de sala), a partir
  del `playerShoot` que ya se enviaba.
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
  Los impactos leves son aditivos y breves. Las balas propias acentuan ademas la
  parte alcanzada (`ZombieHitAccent`): la cabeza da un tiron, el hombro del
  brazo alcanzado se echa atras y el torso cede hacia la pierna herida, con mas
  fuerza cuanto mayor el dano base del arma. Son muelles criticamente
  amortiguados y acotados: no reinician clips ni ataques y nunca tocan las
  piernas.
- Todo golpe que hace dano (bala, cuchillo, explosion; tambien replicado en
  cooperativo) hace tambalearse al zombi (`ZombieStagger`), solo con el
  esqueleto: la columna por encima de las caderas se dobla y gira con el
  impacto, la cabeza da un latigazo y los brazos se abren buscando el
  equilibrio. La raiz, las caderas y las piernas siguen el clip, asi que el
  cuerpo nunca resbala ni hunde los pies. La fuerza (`staggerForce`) crece con
  el peso del arma (mismo escalado logaritmico por dano base que las heridas),
  con la parte de vida que se lleva el golpe y en la cabeza: un subfusil solo
  provoca un respingo; un fusil de precision, un tambaleo claro. Solo los
  golpes fuertes cuestan paso (la perdida crece con el cuadrado de la fuerza y
  nunca baja del 45 %), y la marcha se frena con el desplazamiento real. El
  bruto lo nota la mitad (`staggerScale`) y un reptante solo se estremece. Los
  impactos seguidos acumulan resistencia, asi que el fuego automatico no apila
  la pose ni deja al zombi clavado, y nunca cancela un ataque.
- El golpe mortal siempre se encaja antes de caer: su reaccion (al menos 0.8 de
  fuerza, tambien en el invitado al recibir `zombieDeath`) se superpone durante
  0.45 s al inicio del crossfade de muerte, que de otro modo la anularia.
- Cada bala propia que alcanza a un zombi vivo deja un orificio de entrada
  donde el rayo encuentra la piel animada: agujero oscuro, borde rojo humedo y un
  reguero que cae segun la gravedad en el momento del impacto, de 7 a 12 cm para
  leerse a media distancia (`SkinSurfaceSampler`), unido
  al hueso que la mueve (`ZombieWounds`); su tamaño crece con el dano base del
  arma. Hay como maximo `ZOMBIE_WOUND_LIMIT` por cuerpo (se reutiliza el mas
  antiguo), se encogen con el desvanecimiento del cadaver, desaparecen con la
  vaporizacion del VORTEX-9 o al reciclar el cuerpo, y no se crean si el disparo
  solo roza el hitbox sin tocar la piel ni en el cuerpo procedural de respaldo.
  Las cabezadas y el tipo de muerte siguen decidiendolos los hitboxes. El steering frena los cambios de
  direccion, manteniendo las restricciones de paredes y rampas.
- Muertes segun el golpe letal (`ZombieDeath`), sin ragdoll: cuchillo (gira,
  se sujeta el corte y cae de lado), pistola, L96 y M40 (retrocede y cae de
  espaldas), automaticas (sacudidas por cada impacto y se desploma de bruces),
  headshot con arma de fuego (se derrumba inerte), VORTEX-9 (vaporizacion de
  1.0 s con `Vortex9DissolveShader`, borde incandescente verde y cenizas
  ascendentes), Tesla (convulsiona rigido y cae), ZEUS-77 forjado
  (`overload`, `ZOMBIE_OVERLOAD_DEATH`: convulsiones violentas con arcos
  violeta por todo el cuerpo y la piel en morado durante 1.8 s, se desploma
  y, ya cayendo, el disolvente de la VORTEX-9 lo desintegra en morado con
  cenizas mientras se aplasta y se hunde; con efectos reducidos, menos
  arcos y cenizas), ФАКЕЛ-33 forjada (`cinder`, `ZOMBIE_CINDER_DEATH`:
  cualquier zombi de la horda que toque el chorro, Brutus incluido, recibe
  toda su vida restante en un golpe, `ZombieManager.disintegrateZombie`;
  se retuerce con el clip `burn` envuelto en fuego azul, con la piel
  brillando en azul y grietas de brasas azules, y desde 0,25 s el
  disolvente lo desintegra en azul hasta desaparecer a 1,25 s, sin charco
  de sangre ni quemadura residual; una sola baja y recompensa) y Barrett
  (`shatter`, siempre,
  incluso en headshot: el cuerpo desaparece y `ZombieGibs` lanza sus pedazos con
  munones rojos, restos y gotas de sangre varios metros en la direccion del
  disparo, con una nube de sangre que queda un instante en el aire;
  rebotan en los solidos del mapa (`colliders`, via `GibWalls`), donde la
  sangre queda pegada, y caen al suelo o encima de muebles; un charco se
  extiende bajo el cuerpo; reposan el tiempo del cadaver y se encogen). Un disparo por la espalda lo
  tumba hacia delante y los impactos laterales giran la caida hacia el empuje.
  La pose viva se funde con la caida conservando la inercia de la marcha; el
  cuerpo llega al suelo con impacto y, hasta aterrizar, nunca vuelve a subir
  (si las rodillas tocan el suelo lo sostienen hasta que se desploma). Al morir se retiran al instante los colliders y el estado A*/colas de barrera;
  el anfitrion replica estilo y lado del impacto.
- Las cuchilladas producen salpicaduras contenidas en cada impacto, sea mortal
  o no. Las balas tambien expulsan sangre; los impactos consecutivos sobre un
  mismo zombi aumentan la cantidad mientras mantengan la cadencia. `ZombieBleeding`
  decide la intensidad y `ZombieBlood` acumula las gotas y manchas fuera del
  cuerpo: permanecen aunque el zombi avance, muera o se reutilice. Comparten
  material, gotas, caida y contacto con superficies con el Barrett
  (`BloodDropMotion`); su desmembramiento conserva su propio efecto.
  Las gotas atraviesan los huecos de ventanas y entradas de barricadas:
  los bloqueos invisibles que frenan al jugador no reciben manchas.
  Al adherirse, toda la mancha se ajusta a la cara solida que la sostiene;
  los impactos en bordes no sobresalen hacia el hueco de una ventana.
  Las gotas son pequenas y de dispersion limitada; las manchas quedan finas,
  con contorno irregular, un rojo oscuro con brillo humedo y sombreado plano (sin el borde iluminado de una esfera aplastada).
  Solo se pegan donde hay una superficie visible: en el lateral acolchado de un
  mueble la gota resbala hasta el suelo y sobre un mueble irregular (bancos,
  carros, bidones) desaparece sin mancha. El Barrett conserva su desmembramiento
  con una nube mas breve y tenue, menos gotas y un charco de menor tamano.
  Las manchas duran 45 s, se encogen al final y se reciclan al alcanzar el limite
  de 1024 gotas/manchas, con un solo draw call. Se limpian al reiniciar la run.
  Fuego y armas de energia conservan sus efectos propios. En cooperativo se
  generan desde impactos y bajas confirmados por el anfitrion.
- Cada zombie alcanzado por la cadena ZEUS-77 queda cargado 2.8 s
  (`ElectricArcRibbons`): rayos que saltan entre sus articulaciones y un
  destello azul en la piel, vivo o ya caido en el suelo. Es solo visual (un
  draw call por cuerpo cargado, sin luces) y el anfitrion envia los IDs
  alcanzados en `teslaChain`.
- Granada letal (individual y cooperativo): la F-1 sovietica, definida como datos en
  [granadas](../src/config/grenades.ts). La run empieza con 2, cada ronda
  nueva suma 1 como maximo y se llevan 4 como mucho; una pared de granadas del mapa llena
  la bolsa. En el HUD, cada granada recuperada cae girando en su hueco con un
  destello (`lethalPouchIcons`). G, el boton GRAN tactil o la cruceta derecha la lanzan: como el
  cuchillo, el arma baja, la mano derecha saca la granada, quita la anilla y
  la lanza por encima del hombro (`GrenadeThrow`); interrumpe la recarga, no
  se combina con el cuchillo ni con ponerse un anillo o la mascara, y solo se
  gasta al soltarla. La espoleta arde desde que sale la anilla (3,6 s): una
  pulsacion la lanza con unos 3,2 s por delante; mantener el boton deja el
  brazo armado mientras se cocina, con un tic por segundo y un dial alrededor
  de la mira con los segundos que quedan (rojo en el ultimo), y soltarlo la
  lanza con lo que le quede (`GrenadeHand`). Si se agota en la mano, estalla ahi.
  Rebota en los solidos del mapa (los mismos `GibWalls` de la sangre) y rueda
  hasta pararse (`GrenadeFlight`). El dano cae con la distancia horizontal (`GrenadeBlast`), las
  paredes y puertas cerradas protegen, y los anillos de dano lo escalan. Una
  baja a sus pies revienta el cuerpo (`shatter`); las demas lo lanzan por los
  aires de espaldas (`blown`). Cada superviviente dentro del radio de
  mutilacion tiene un 40 % de quedarse sin piernas; los Brutus nunca. Paga un
  impacto por superviviente, sacude la camara segun la distancia y tambien
  hiere a quien la lanzo (nunca al compañero): a menos de 0,9 m, o si se agota
  en la mano, lo mata de golpe aunque acabe de recibir otro impacto (en
  cooperativo lo deja abatido; un anillo de Resurreccion lo salva). Al guardian del Protocolo 33 le
  rodea el escudo como el fuego y le quita hasta `guardianDamage` (1500 en el
  centro, con la misma caida), mucho mas que a un zombi. Explosion (`GrenadeExplosionView`, sin luces
  reales): destello cegador, bola de fuego con columna, onda de choque y
  resplandor falso sobre el suelo, metralla incandescente, polvo rasante,
  humo que sube varios segundos y una quemadura que dura unos 20 s en el
  suelo. El sonido es procedural (chasquido, estampido, subgrave, cascotes,
  cola y pitido de oidos si fue cerca) salvo que exista
  `public/assets/audio/f1_explosion.mp3` (`GrenadeAudioConfig.explosionSampleFile`),
  que lo sustituye. En cooperativo cada jugador lleva su bolsa; consulta
  [cooperativo](MULTIPLAYER.md#alcance-y-límites).
- Zombis tullidos (`Zombie.cripple`): caen sobre las manos y siguen
  arrastrandose con el clip `ZombieCrawl` del GLB (el mismo de la aparicion)
  al 32 % de su velocidad, sincronizado con el avance. Atacan y golpean
  barricadas zarpando desde el suelo, cruzan las ventanas sin la trepada de
  pie y, al morir, se quedan boca abajo donde estaban. La cabeza y el torso
  siguen a los huesos, asi que sus hitboxes bajan con ellos. El invitado
  cooperativo los ve arrastrarse igual.

## Mapas e interacciones

- Burned Mansion sigue publico. Station 33 aparece en el menu con candado
  mientras la cuenta no tenga su producto; durante la beta cerrada los testers
  lo reciben. Tras el agradecimiento al tester empieza la partida. Los enlaces
  directos respetan el mismo permiso; detalles y limites en
  [acceso de beta](../public/beta/README.md).
- Die Kathedrale esta en desarrollo (`workInProgress` en el registro): su
  tarjeta sigue visible con candado y "WIP", deshabilitada para raton, toque,
  teclado y mando, y ni el menu ni `?map=` la arrancan aunque la cuenta tenga
  su producto. Solo un servidor de desarrollo con `VITE_WIP_MAPS=true` la
  libera; ninguna build de produccion lo permite.

- `DieKathedraleArena`: Die Kathedrale, la catedral de Palma, individual y premium. La
  nave es un solo espacio a la vista y cinco zonas a pie, separadas por rejas, pretiles
  y un derrumbe que nunca llegan a la boveda. Empieza en el nartex (M14) y
  se abre reja a reja por Points: nave central, naves laterales con sus
  capillas (PPSh-41), crucero y presbiterio (AK-47) y, por el postigo de las
  puertas mayores, la plaza (M60 y Mystery Box). Las entradas de zombis de
  cada zona despiertan con su primera reja. Los primeros candelabros iluminan
  el inicio; los demas prenden progresivamente al acercarse por zonas abiertas
  y conservan sus llamas hasta reiniciar. Las luces reales se reutilizan cerca
  del jugador dentro del presupuesto de calidad; la intro no descubre velas.
  Sin anillos, electricidad ni final. Zonas, precios y guia en
  [Die Kathedrale](DIE_KATHEDRALE.md).

- `BurnedMansionArena`: dos plantas, colision, diez ventanas, puertas por
  Points, wall buys, bunker, pickups, escalera continua y sala secreta. Es el
  unico mapa cooperativo. La planta baja se recorre en orden: inicio, salon de
  la Mystery Box (salon ampliado al oeste, con la caja en el lateral oeste,
  la taquilla de autorreanimacion en la pared sur y la AK-47 en la pared este,
  dejando libre el paso central), gran comedor (ala norte con la Vector y la M40 en pared; mesa,
  aparador, vitrina y chimenea solidos, y sobre ella el retrato de un oficial
  aleman cuyas pupilas brillan en rojo y siguen suavemente al jugador local
  dentro de sus cuencas, tambien en cooperativo; easter egg de la Torre Quemada de
  Pokemon: al abrir su puerta, con una probabilidad baja, un fantasma
  visual aparece unos segundos sobre la mesa) y pasillo este con la puerta del
  bunker; el salon y el pasillo solo se comunican a traves del comedor. Su ambientacion es una casa victoriana quemada sobre
  un bunker de defensa civil: papel damasco, zocalo de nogal y parquet
  carbonizados, vigas a la vista, madera que aun humea (brillo emisivo que
  respira), lamparas de laton arriba y apliques enjaulados abajo, ceniza,
  brasas y humo bajo el techo (mas densos en Ultra Max, que ademas mantiene fuegos
  vivos en la chimenea del banquete, sobre el armario carbonizado del pasillo
  este y en la mesa, con chispas, halo y luz calida parpadeante
  [`MANSION_SMOULDERING_FIRES`]), y un jardin muerto con arboles, tumbas y verja
  tras las ventanas. Las texturas se hornean en codigo
  (`shared/ProceduralSurface`, compartido con Station 33) con UV ancladas al
  mundo para que el patron continue entre trozos de muro. La arena orquesta;
  la decoracion vive en `maps/burnedMansion/`, nunca es solida y no cambia la
  geometria jugable.
- `Station33Arena`: individual y premium, se construye por fases y crece hacia
  el norte y hacia abajo segun el plan de ejes de `Station33Config`. La Fase 1
  es el vestibulo: cuatro entradas con chapas de acero (escalera de superficie,
  puerta de servicio y dos rejillas), el M14 (800 / 625) en pared, la
  pared de granadas F-1 del muro este (250, llena la bolsa; `grenadeBuys`)
  y la escalera mecanica sellada. Junto al muro sur hay una caja de municion
  reutilizable por 800 Points, con la misma compra y feedback que la de
  Burned Mansion (`shared/AmmoRefill`). Easter egg del vestibulo: al acercarse a
  la ventanilla de billetes, con una probabilidad baja por acercamiento (una
  vez por partida), una ventana se abre de golpe y sale un zombi de la ronda
  que se puede matar; consume un spawn pendiente, asi que no cambia el total
  de la ronda (`shared/AmbushTrigger`, `ZombieArena.onAmbush`).
  La Fase 2 es la consigna, tras una puerta de pago de chapa (750) en
  el muro este: dos entradas mas, que solo generan zombis con la puerta
  abierta, la PPSh-41 (1250 / 625) en
  pared, la Mystery Box y la taquilla del
  anillo de Resurreccion. Las rejillas este del vestibulo se separaron para
  dejar un pasillo de 5,8 m. La Fase 3 son las cocheras, tras una puerta de
  servicio (1250) en el muro norte junto a la escalera: una nave de dovelas
  de hierro con dos trenes abandonados (uno junto al muro, que se pierde en
  un tunel hundido, y un vagon descarrilado con un carril a cada lado), tres
  entradas mas (postigo del germozatvor, rejilla y puerta de la subestacion)
  y la M60 (2500 / 1250) en pared. La Fase 4 es la sala de maquinas, tras una
  puerta de pago (1500) en el muro norte de las cocheras: galeria de servicio,
  motor-generadores, transformadores, dos entradas mas, el interruptor
  general (`PowerLever`, un `ArenaPowerSwitch`) y el armario de
  descontaminacion de la ФАКЕЛ-33 en el muro sur (`WeaponStation`, un
  `ArenaWeaponStation`): exige electricidad y recuperar el cristal de un
  portador de la horda para habilitar la compra a 3500; despues repone
  sus cristales a 1750; sin ella el aviso dice que falta la electricidad.
  Es exclusiva del mapa: `ZombieMapDefinition.exclusiveWeapons` la precarga
  solo aqui, fuera de la Mystery Box y del cooperativo. Una puerta de 2000 en
  el muro norte de electricidad abre el taller de mantenimiento: sala amarilla
  con banco de trabajo, taquillas, el anillo de Tiro doble, la M40 (2000 / 1000)
  en el muro oeste y una entrada propia
  que solo genera zombis al abrir la zona. Una compuerta de 3500 en el muro
  oeste de electricidad abre una galeria que cruza el eje de la escalera
  hasta la camara KOVKA (`KOVKA_CORRIDOR`): nave
  abovedada con un reactor horizontal dormido en un foso, una cubierta en la
  planta 0 a su alrededor (barandillas solidas cierran el foso; pasarelas y
  escaleras son decorado), dos entradas propias y el sitio reservado de la
  la forja: la `UpgradeMachine` compartida (un `ArenaUpgradeMachine` que el
  modo lleva con `ZombiesWeaponUpgrade`) cobra 5000 por el arma en mano y
  la saca del inventario (`ModeContext.storeWeapon`): su hueco queda
  reservado, el jugador sigue con su otra arma y, mientras tanto, esa arma
  no se vende en paredes, estaciones ni vitrinas ni sale en la caja. No
  acepta la unica arma que se lleva. Forja durante `forgeSeconds` (siete
  segundos y medio en KOVKA) con esa arma girando en la camara mientras el
  acabado se pinta sobre ella (y el mapa lo sonoriza con `onForge`: el
  reactor gime, `forge-wail`). Station 33 escenifica ademas el reactor del
  fondo a partir de `UpgradeMachine.forgeProgress`: `KovkaReactorDrive`
  (logica pura) acelera la carga hasta un climax, marca latidos a tiempos
  fijos y descarga al acabar; `KovkaReactorForge` lo pinta con cuatro draw
  calls sin luces (iris de aspas giratorias, anillo de bobinas, rayos con
  menos arcos en efectos reducidos y destello del nucleo) y el mapa los
  sonoriza (`forge-surge`, `forge-discharge`). Un reinicio lo apaga sin
  descarga. Al terminar suena el aviso y la camara late
  como una baliza con el arma expuesta, sin devolverla sola. Hay que volver
  a usar la maquina para recogerla: vuelve a su hueco con su municion, y
  solo entonces pega el doble (multiplica en `weaponDamageScale`), lleva el
  doble de cargador y de reserva maxima (`ammoMultiplier` de la maquina,
  aplicado por el shell con `setWeaponCapacityScale` sobre
  `Weapon.setCapacityScale`: la municion que llevaba conserva su
  proporcion, redondeada hacia abajo), se recarga hasta esas capacidades y
  lleva el acabado del mapa (`WeaponFinish`, aplicado por el shell con
  `setWeaponFinish`); una vez por arma y partida. Recarga, recompra de
  municion, Radiante y recoger de nuevo el arma (caja) usan la capacidad
  forjada hasta reiniciar. Reiniciar olvida el
  arma que quedara en la maquina. El acabado pinta el cuerpo del arma con una nebulosa que
  fluye (shader de ruido en el espacio del arma, con luz propia, venas,
  estrellas que titilan y un borde brillante), deja el acero brillante como
  remate pulido y hace saltar arcos electricos entre puntos del arma
  (`ElectricArcRibbons`), que se atenuan al apuntar. En la camara de la
  maquina el acabado se pinta poco a poco (`WeaponFinishLayer` con
  `paint`): el arma entra desnuda y, entre el 10 % y el 85 % de la forja, un
  frente deshilachado y brillante lo extiende de la culata a la boca; los
  arcos crecen con el. Con efectos reducidos la
  nebulosa omite la deformacion del dominio; no anade luces ni draw calls
  salvo el de los arcos. El acabado puede cambiar tambien los disparos
  (`WeaponFinish.shots`, solo visual): en KOVKA las armas de fuego lanzan
  una trazadora roja anaranjada breve que sale de la boca y converge con la
  trayectoria real hasta el impacto (`TracerStreak`, en lugar de la
  trazadora normal) y sus fogonazos y luz de disparo se tinen de rojo
  anaranjado; el VORTEX-9 dispara plasma rojo y el ZEUS-77 un proyectil y
  arcos morado oscuro de nucleo violeta brillante, con un halo morado
  aditivo (visible en la oscuridad) dentro de una envoltura de energia
  oscura y ramificaciones moradas que se omiten con efectos reducidos. El
  modo pasa el aspecto al proyectil y a los arcos sin tocar el
  `EnergyWeaponConfig`, asi que dano, alcance y cadena no cambian;
  reutiliza las luces existentes. La ФАКЕЛ-33 forjada lanza un chorro mas
  ancho de fuego azul intenso con corazon blanco azulado y su cristal se
  vuelve azul oscuro (`FlameShotLook`: `FlameJet` y `FlameParticles` cambian
  solo uniforms, con los mismos draw calls; con efectos reducidos las bolas
  de fuego conservan el tamano basico y la mitad del pool). El cono de dano
  no cambia. Los zombis que mata el ZEUS-77 forjado mueren sobrecargados, y
  los que toca la ФАКЕЛ-33 forjada arden hasta las cenizas en el primer
  contacto (ver muertes de zombis). La compuerta lleva un sello (`PointDoorSeal`): sin
  electricidad no se vende y lo dice su aviso, un piloto rojo pasa a verde
  y el aviso de electricidad lo anuncia (`announcementKey`); el nucleo del
  reactor solo brilla con la electricidad. Un unico rectangulo de
  `playerBounds` y de navegacion cubre todas las salas: muros, trenes y
  puertas cerradas son lo que impide el paso, y la arena para al jugador en
  cada entrada de tipo puerta para que ningun pasadizo de spawn sea
  transitable; los muros de mas de 20 m se parten porque el filtro de
  obstaculos de los zombis ignora los solidos mayores. Reiniciar cierra las
  puertas y duerme sus zonas. Su final es la evacuacion del Protocolo 33
  (ver la evacuacion de un mapa, abajo). La arena solo
  orquesta: cada zona tiene su builder en `station33/`, y la luz y la
  atmosfera son sistemas propios. Direccion de arte y directrices del mapa:
  `STATION_33.md`.
- Interruptor general de un mapa (`ArenaPowerSwitch`, opcional): el modo lo
  ofrece y lo acciona con USE, gratis y una vez por partida
  (`ZombiesPowerSwitch`: aviso, sonido `playPowerSwitch` y cartel); el mapa
  anima la palanca y se enciende. En Station 33, al cerrar los contactos,
  `switchOnPower` restablece la red: `Station33Lighting.restoreMains` repite
  el arranque por circuitos de la intro y deja luces y emisivos multiplicados
  y con fallos mas raros, enciende el circuito `mains` (apagado del todo
  hasta entonces), sube relleno y entorno, aclara la niebla, hace temblar la
  estacion y las taquillas se ven mucho mas brillantes. Factores en
  `STATION33_MAINS`; reiniciar lo devuelve todo a oscuras.
- Evacuacion de un mapa (`ArenaEvacuation`, opcional; el Protocolo 33 de
  Station 33, solo individual): el modo la ejecuta con `ZombiesEvacuation`
  sobre el estado puro `EvacuationProtocol`
  (`locked -> exploration -> ready -> defending -> escaping -> completed | failed`)
  y el mapa solo la presenta. Sin electricidad el panel y los interruptores
  avisan de que falta y no hacen nada. Con ella, USE en el panel del taller
  explica que faltan dos sistemas auxiliares (ventilacion, en la sala de
  maquinas, y seguridad, junto al germozatvor de las cocheras) y abre una nota
  en la esquina del HUD; cada uno es un `PowerLever` que se acciona una vez
  por partida con su sonido, su piloto verde y, la ventilacion, su ventilador.
  Con los dos, el panel ofrece iniciar el protocolo por exactamente 10000
  Points: se comprueba el saldo, el protocolo acepta el inicio una sola vez y
  solo entonces se cobra. Arranca la sirena, la megafonia y la alarma (las
  luces de bateria de toda la estacion destellan en rojo y la red cae), la
  nota pasa a modo urgente y las rondas se suspenden: `EvacuationHorde` genera
  zombis de la ronda actual cada vez mas rapido y con mas limite simultaneo
  (menor en efectos reducidos), solo por las entradas de las cocheras, la sala
  de maquinas y el taller. La compuerta acumula 45 s de desbloqueo mientras el
  jugador siga a menos de `defenseRadius` del panel, zona que marca en el suelo
  del taller un anillo brillante (`DefenseZoneRing`, recortado a las paredes de
  la sala): ambar mientras se defiende; fuera se pausa sin perder progreso, con
  cartel, nota, el anillo en rojo y el indicador del panel parpadeando. Los zombis
  no atacan el panel. Al completarse la compuerta sube (deja de ser solida al
  instante) y empiezan 60 s para subir por el pasillo y la escalera (planta 1,
  `escapeStairTransitions`) al patio de la superficie, que los zombis tambien
  recorren, y usar el camion. Al llegar a esa planta, el objetivo del HUD
  pasa de subir a la superficie a llegar al camion. Durante la huida `EscapeAlarm` mantiene la
  sirena sin pausa, repite la megafonia y, en los ultimos 25 s, suma un
  claxon cada vez mas rapido; fuera de la planta del panel se oyen lejanas y
  amortiguadas. Lo logrado lleva al final del mapa; si se acaba
  el tiempo, cartel y la derrota normal. Al subir, `SurfaceMood` mezcla la
  niebla, el fondo y la hemisferica del mapa con los de la superficie, y
  `SurfaceSnowfall` hace nevar sobre el patio (solo con la vista en el tramo
  alto de la escalera o arriba; copos segun la calidad del dispositivo).
  Reiniciar lo devuelve todo al estado inicial.
- Guardian de la extraccion (`ArenaEvacuation.guardian`, opcional; en
  Station 33 el CAPITAN URSS, un supersoldado sovietico zombificado con
  escudo): durante la huida, al entrar en su zona (el patio) arranca su
  entrada filmada (`PROTOCOL33_GUARDIAN_ENTRANCE`, 7 s, sin saltar): la run
  se congela (horda, reloj, vida y control del jugador) y, entre bandas de
  cine, aparece agazapado sobre el primer poste electrico tras la valla,
  ruge, salta al patio, aterriza y vuelve a rugir bajo su rotulo; luego la
  camara vuelve a primera persona y empieza el combate. Mientras pelea, el
  reloj de huida y la horda del protocolo se
  detienen y el camion no admite subir. `ZombiesGuardian` lo orquesta sobre
  el cerebro puro `CaptainUssrBrain` (aleatoriedad inyectada) y su vista
  `CaptainUssrView`. Su escudo bloquea los disparos que llegan dentro de su
  arco frontal y cualquier impacto en el propio escudo; la cabeza recibe el
  doble y aturdido recibe mas. Las llamas del ФАКЕЛ nunca se bloquean
  (`CaptainUssrBrain.takeBurn`): queman desde cualquier lado, como premio a
  tenerlo. Los proyectiles de VORTEX-9 y ZEUS-77 atraviesan el escudo que
  lleva en el brazo (`takeBolt`, cuentan como impacto al cuerpo), pero no le
  hacen dano si dan al escudo mientras vuela. Su cuerpo se anima con fisica: la coreografia pura
  (`CaptainUssrChoreography`) fija cada pose y muelles amortiguados
  (`CaptainUssrPose`) le dan peso e inercia y encajan los impactos como
  sacudidas segun el lado y la parte alcanzada; las piernas se resuelven por
  IK sobre los pies que planta su marcha (`CaptainUssrGait`, sin patinar) y
  el brazo del escudo sobre su asa. Aterriza del salto con una rodilla y el
  puño en el suelo, tensa cada ataque (el aro del escudo destella justo antes
  de soltarlo), rasca el suelo antes de embestir, rebota contra lo que choca,
  ruge al aterrizar, echa vaho y en la fase 3 humea y le brillan las venas. En la
  fase 3 (ULTIMA ORDEN) ademas el traje arde sin llama, le recorren arcos
  electricos entre las articulaciones con chispas y humo y los ojos brillan mas. Al morir se tambalea, cae de rodillas y se desploma de
  bruces; el escudo se le escapa, rebota y se asienta vibrando como una
  moneda (`DroppedShield`). Pisadas, golpes contra el suelo y el escudo
  suenan y, cerca, sacuden la camara. Su tema de duelo
  (`ArenaEvacuationGuardian.music`; en Station 33 `captain_ussr_theme.mp3`)
  sustituye a la musica del mapa al despertarlo y se funde al caer; si el
  archivo no carga, sigue sonando la del mapa. Ataques: golpe de escudo a corta distancia,
  lanzamiento del escudo (vuela hasta donde estaba el jugador y vuelve; sin
  el queda expuesto de frente) y, desde la fase 2, la carga en linea recta,
  que si choca con la valla o un solido lo deja aturdido. Fase 2 (PROTOCOLO DE
  CONTENCION, 70 % de vida): camina mas rapido, persigue mas deprisa al
  jugador que se aleja y recupera antes; añade el golpe al suelo (alza el
  escudo y lo clava delante: daña y empuja solo dentro de un cono marcado en
  rojo en el suelo, que deja de seguir al jugador al final de la carga),
  el barrido electrico (marca en azul una franja entre dos raíles que cruza
  el patio por donde esta el jugador, suena una carga que sube de tono y
  1,2 s despues la descarga daña una vez a quien siga dentro; tras el
  barrido queda aturdido y expuesto), pequeños grupos de zombis con tope estricto de vivos que nunca llegan en
  mitad de un ataque (`GuardianReinforcements`), luz de emergencia roja
  (`ArenaEvacuationGuardian.showDuelPhase`), sirena y aviso distorsionado por
  los altavoces del patio y chispas y humo en sus bordes. Fase 3 (ULTIMA
  ORDEN, 35 %): carga doble con una breve pausa legible entre cargas (si la
  primera choca, no hay segunda), barrido doble (la segunda franja, con su
  propia marca y aviso, cruza la primera por donde estaba el jugador al caer
  esta; la ventana de castigo llega tras la segunda), onda expansiva circular cuyo alcance se
  marca en el suelo (se evita quedando fuera o saltandola), nunca dos ondas
  ni dos golpes al suelo o barridos seguidos, la onda se extingue antes de su
  siguiente ataque y ningun barrido empieza con ella activa, la luz parpadea de forma controlada, suena la bocina y caen
  descargas electricas en los bordes del patio. Mientras alza el escudo para
  el golpe al suelo, la onda o el barrido, baja la guardia. Su muerte, un
  ataque de ira o reiniciar descartan cualquier barrido marcado. Al cruzar cada fase, sin
  cartel: al cruzarlas entra en un ataque de ira (`enraged`), se encorva
  temblando, grita al cielo agitando el puno y con las venas y los ojos
  encendidos, con la guardia baja. Si estaba con el escudo en el aire, en
  plena carga o aturdido, espera a terminar.
  Barra con nombre y marcas de fase arriba en el centro (`HUD.setBossBar`);
  su objetivo ocupa el lugar del Protocolo 33 durante el duelo. Tras abatir al
  guardian, vuelve la indicacion del camion con el tiempo restante y se puede
  subir mientras la horda y el reloj se reanudan. Le afectan balas,
  VORTEX-9, Tesla y llamas, pero no el cuchillo ni la salpicadura. Valores en
  `CAPTAIN_USSR`.
- Puertas de pago de Station 33: la misma `PointDoorView`/`BuyableDoorVisual`
  que la mansion con chapas de acero en lugar de tablones y superficie de
  impacto metalica.
- Los fluorescentes de Station 33 parpadean por circuitos desfasados (colores
  de materiales compartidos, sin luces nuevas). Megafonia, tren lejano y
  apagon son eventos de datos del mapa con temporizador
  (`AmbientEventScheduler`) y voz procedural en `AudioSystem`, junto a un golpe
  metalico con eco en el tunel y maquinaria lejana en la subestacion; un
  `sampleFile` en el evento la sustituye por un MP3 de `public/assets/audio/`.
  Burned Mansion programa igual crujidos de vigas, golpes en el bunker, rafagas
  de viento, brasas en la chimenea del banquete y un aullido lejano
  (`MANSION_AMBIENT_EVENTS`), separados por silencios largos y reproducidos
  localmente en cada cliente cooperativo.
- Un mapa puede declarar una intro (`ArenaIntro`: planos de camara,
  duracion y presentacion del HUD). `ZombiesMode` la reproduce una sola vez
  al empezar la partida (no al reanudar ni reiniciar) con `IntroCinematic`,
  cuya camara renderiza el shell sin ningun personaje jugador, arma ni
  brazos durante todo el recorrido. El arma y los brazos de primera persona
  aparecen al terminar o saltar la intro. La ronda no avanza hasta
  que termina, y el ultimo plano aterriza en los ojos del jugador. Se salta
  con cualquier tecla (tras 0.6 s), con el boton tactil o al pausar.
  La de Station 33 (8 s) arranca a oscuras con solo la luz de emergencia, un
  tren hace temblar la boveda, los circuitos se encienden uno a uno y la grua
  recorre la nave mientras aparece el titulo premium dorado.
  La de Die Kathedrale (16 s) se aproxima desde el exterior sobre la plaza,
  entra por el postigo y sube sobre las rejas para revelar la boveda y el
  roseton antes de regresar al punto de inicio. Su titulo propio deja libre
  el centro de la escena; viento, madera e hierro procedurales acompañan
  el recorrido. Las luces siguen a la camara con el mismo presupuesto de
  calidad. El postigo vuelve a verse cerrado al terminar o saltar: no se
  compra ni se abre ninguna zona. Fuente e intencion en
  [Die Kathedrale](DIE_KATHEDRALE.md#entrada-cinematografica).
- El menu principal ordena cabecera (titulo e idioma), tarjetas de mapa,
  accesos a multijugador y ajustes, y un pie con creditos, privacidad y un enlace
  a la [web principal](https://zeroed-web.com) que abre en otra pestaña. Cada
  mapa tiene una tarjeta ilustrada con realce al pasar el cursor o enfocar con
  teclado. Todas usan la misma estructura y efectos, con acento rojo para el
  mapa incluido y dorado para los premium; un mapa bloqueado oscurece su arte
  bajo un candado. Las imagenes se recortan a la ilustracion y se acortan en
  ventanas bajas; nombres y lemas se traducen y `HUD` rellena desde el registro
  las etiquetas de jugadores, acceso y accion (jugar, desbloquear o WIP). En
  pantallas bajas el menu se compacta; si aun no cabe, se desplaza la capa
  completa (nunca el panel) y la niebla queda fija detras.
  La pantalla de carga y la pausa nombran el mapa elegido. `?map=<id>` sigue
  disponible como atajo de pruebas.
- Las luminarias ambientales de Burned Mansion emiten rojo y sufren parpadeos
  electricos irregulares y desfasados; las luces funcionales de armas,
  recompensas y objetivos conservan su identidad visual.
- `ZombiesMode` posee run, rondas, salud, economia y progresion; el arena posee
  geometria, colliders, spawns, barreras y puertas.
- Barreras: HP autoritativo, rotura visual independiente y reparacion limitada
  por ronda. Puertas y wall buys cobran de forma atomica. La sala de inicio
  ofrece la M1911 (500) y el M14 (800) en su pared norte.
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
  La PPSh-41 forma parte del arsenal estandar de la caja; la Vector sigue disponible.
  La M40 (M40A5) comparte todos los atributos de la L96, incluidos disparo y
  cerrojo, salvo nombre, modelo y un cerrojo algo mas rapido; esta en la caja
  y en pared en ambos mapas (2000 / 1000).
  El Barrett .50 se obtiene en la caja y gratis en los baules con candado
  numerico: el del puesto de milicia de Station 33 (tras la puerta de 3000)
  y el de Burned Mansion, junto a la pared oeste del bunker, orientado hacia
  el interior. Ambos comparten el mismo codigo. En Station 33 el Barrett se
  presenta como el PTRS-41 sovietico (nombre y modelo en caja, baul, HUD,
  avisos y primera persona) con exactamente las mismas estadisticas, sonido,
  efectos y animaciones; Burned Mansion y el cooperativo conservan el Barrett.
  `CodeWeaponChest` usa el contrato `ArenaWeaponPickup` con `codeLock` opcional:
  el teclado pausa la simulacion individual, abrir revela el arma y recogerla
  pasa por el inventario habitual; una entrega por partida, restaurada al reiniciar.
  En cooperativo el teclado bloquea solo la entrada local, sin pausar la partida;
  el anfitrion valida el codigo, comparte la apertura y concede una unica arma.
  Es un francotirador pesado semiautomatico,
  con mira telescopica, mayor dano y retroceso que la L96 y menor movilidad;
  cada bala atraviesa hasta cinco zombis en linea (`projectile.maxTargets`),
  con dano completo a cada uno; una pared la detiene (la L96 atraviesa hasta tres);
  reutiliza la recarga de fusil y no necesita accionar el cerrojo entre disparos.
  La VORTEX-9 se obtiene exclusivamente en la caja; ZEUS-77 es una tirada
  legendaria de aproximadamente 1 % y encadena objetivos. Ambas usan
  proyectiles de energia. Su cuerpo bloquea al jugador con un collider fijo
  ajustado al tamano y orientacion de la caja, tanto en individual como en
  cooperativo; la tapa animada y el arma flotante no alteran ese volumen.
- Los tres faroles de la sala secreta se encienden con USE al mirarlos de cerca
  con linea de vision libre. Al llenarlos de almas se abre una pared una sola
  vez por run. Su circulo ritual dispara un susto unico:
  las velas se apagan, el circulo estalla en rojo y una aparicion emerge y se
  lanza contra la camara local antes de desaparecer de golpe. El sonido sigue
  los mismos tiempos (`RITUAL_SCARE_TIMELINE`); en individual el impacto
  sacude la camara. La unica vitrina del bunker ofrece ZEUS-77 y exige
  300 bajas personales y 10000 Points.
  Cada vitrina se compra una sola vez por run. El cierre se retrae con un pulso
  de energia al alcanzar el requisito; comprar eleva el cristal y el arma.
  El cooperativo valida las bajas y cobra al comprador en el anfitrion;
  cada cliente muestra su propio progreso y ambos ven la apertura compartida.
  La VORTEX-9 no tiene recompensa por bajas ni vitrina en el bunker.
  Easter egg del bunker: la ultima mascara de gas de la pared norte
  (`ArenaGasMaskRack`) se pone y se vuelve a colgar con USE. Es cosmetica y
  solo individual (`ZombiesGasMask`): la mano derecha la lleva a la cara como
  un `MeleeArmDriver`, el arma baja y no dispara durante la animacion, y el
  visor SVG del HUD cierra la vista con vaho al respirar.
  El final de 30000 Points es el que declara la mansion (`MANSION_NUCLEAR_ENDING`) y pasa por
  `PLAYING -> ENDING -> CREDITS -> FINISHED` y detiene gameplay.
  La secuencia nuclear dura ~20 s y es CSS puro (transform/opacity, sin bordes
  expuestos): alarma con cuenta atras, detonacion a `NUCLEAR_DETONATION_TIME`
  (flash, bola de fuego, hongo tras la silueta de la mansion y onda
  expansiva). La onda llega a camara (`--impact`, 1.4 s despues) con muro de
  polvo y un temblor fuerte que decae; los creditos esperan ~13 s de
  plano del hongo y la ceniza. El estilo base de cada capa es el fotograma
  final, asi que CREDITS y `prefers-reduced-motion` no saltan. La duracion de
  cada final acaba cuando aterriza el titulo de los creditos, y entonces se
  habilita volver al menu. Sustituye musica/viento y
  arranca `nuclear_alarm.mp3` y `radioactivity.mp3` en bucle;
  `nuclear_explosion.mp3` suena una vez, retrasado para coincidir con el flash.
  Los tres se detienen (y el retraso se cancela) al terminar o salir.
  Individual y ambos clientes cooperativos comparten la secuencia; la ausencia
  de un asset no bloquea el final ni las otras capas. Para incorporar los
  sonidos basta con colocar los MP3 en `public/assets/audio/` y reconstruir
  (en Android, `npm run android:sync`).
  El final de la evacuacion de Station 33 (`PROTOCOL33_ENDING`, presentacion y
  audio `evacuation`) se rueda en la escena con `EndingCinematic` (planos con
  cortes en `PROTOCOL33_ESCAPE_SHOTS`) bajo la misma pantalla, transparente
  (`filmed`): letterbox y grano; el camion cierra sus puertas, enciende los
  faros y arranca; embiste la puerta del patio, que se abre de golpe, y se
  aleja por la carretera. Tras el, una horda
  (`PROTOCOL33_ESCAPE_HORDE`) sale en tropel de la caseta de la escalera y
  corre hasta amontonarse en la puerta abierta: zombis reales del modo, al
  ritmo de una ronda alta como minimo, que no pueden herir porque la run ya
  ha terminado y desaparecen al reiniciar. Un plano montado sobre la cabina
  mira atras mientras la horda le persigue: la caseta revienta en llamas y
  el incendio (`PROTOCOL33_BLAZE`) se propaga por los bidones y los
  respiraderos sobre toda la estacion, con humo, chispas, resplandor en el
  cielo y el foco de la caseta convertido en luz de fuego; luego la caseta
  ardiendo vista desde la puerta. Una grua sube sobre el patio desde la
  horda hasta la catedral en las montañas del horizonte
  (`PROTOCOL33_HIGHLANDS`, visible solo en este final), con el titulo dorado
  «STATION 33» (eco de la intro), la frase de huida y el ultimo mensaje de
  radio. Funde a negro y salen los creditos con
  la ronda, las bajas y los disparos a la cabeza. Todo sigue el reloj de
  `EVACUATION_ENDING_TIMELINE`: la pose pura del camion y la puerta y el
  calendario de la horda (`EscapeDrive`), la propagacion del fuego
  (`EscapeBlaze`), el overlay CSS y el audio procedural de `AudioSystem`
  (arranque, motor, choque, horda, incendio y radio, sobre
  `radioactivity.mp3`). Fuego, cordillera y catedral ignoran la niebla para
  leerse desde lejos. Con
  `prefers-reduced-motion` se pasa directo a los creditos.

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

- Resurreccion (anular, 1 carga): compra inicial de 500 puntos y hasta tres
  recargas por run (1000, 2000 y 4000), despues la taquilla queda vacia.
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
- Prestidigitacion (menique, pasivo, verde): una sola compra por run, 3500.
  Mientras se lleva, todas las recargas duran la mitad (`reloadSpeed`:
  `ZombiesRings` fija `Weapon.reloadTimeScale` en todo el arsenal mediante
  `ModeContext.setReloadTimeScale`; animacion y sonidos siguen el progreso).
  Se vende en la taquilla de la tripulacion de las cocheras de Station 33 y
  necesita electricidad.
- Armadura (corazon, pasivo, rojo): una sola compra por run, 2500. Mientras
  se lleva, la vida maxima se duplica (`maxHealth`: `ZombiesRings` fija
  `PlayerHealth.setMaxHpScale`; al subir suma la vida ganada al momento, al
  reiniciar vuelve a la base). Se vende en el puesto de milicia de Station 33
  y necesita electricidad.
- Tiro doble (indice, pasivo, amarillo): una compra por run, 3000, en el
  taller al norte de la sala de electricidad de Station 33; necesita corriente.
  Aumenta un 25 % la cadencia de cualquier arma equipada, incluido su ciclo de
  cerrojo, y un 10 % el dano de balas, cadenas Tesla, VORTEX-9 y llama/quemaduras.
  Conserva consumo por disparo, recargas y cuchillo; cambiar o adquirir armas
  mantiene el efecto y reiniciar lo elimina. Se combina multiplicando con
  el ajuste de dano de la consola de desarrollo.
- Resplandor (pulgar, blanco, gratis): no se vende. Se enciende mientras se
  llevan cargados todos los anillos del catalogo (`PlayerRings.isRadiant`) y
  se apaga en cuanto uno se gasta (una Resurreccion) hasta recargarlo; un mapa
  sin todas las maquinas nunca lo da. La primera vez, al terminar de ponerse
  el cuarto anillo, las manos se lo ponen en el pulgar con un destello blanco;
  despues solo se ilumina o se apaga. Encendido mantiene un halo blanco tenue
  con rayos lentos en el borde de la vista y da un poco de todo
  (`RADIANT_RING` en `src/game/rings/RadiantRing.ts`, orquestado por
  `ZombiesRadiantRing`): algo mas de velocidad al andar, regeneracion que
  empieza antes, algo mas de puntos por baja, cada pocas bajas una parte de la
  reserva del arma equipada y, cada tantas bajas, un eco que hace que la
  siguiente bala que impacta en un zombi suelte una onda de dano a su
  alrededor. Las bajas solo cuentan mientras brilla. Es por jugador, como
  todos los anillos (el cooperativo no tiene anillos).
- Una maquina puede esperar a la electricidad del mapa
  (`ArenaRingMachine.powered`): hasta entonces esta apagada, no suena y su
  prompt solo avisa de que hay que encender la electricidad, sin cobrar. En
  Station 33 la electricidad (`MapPower`, compartida) empieza apagada en cada
  run y la enciende el interruptor general de la sala de maquinas
  (`PowerLever`, compartido). Antes, un rayo de la
  ZEUS-77 que hace tierra a menos de 1 m de una maquina que espera la
  electricidad le da 60 s de corriente (`ArenaRingMachine.energize`; otro
  rayo reinicia el minuto, no lo suma): vende y suena, parpadea los ultimos
  10 s y vuelve a apagarse. Un aviso lo anuncia y el arco electrico va del
  arma a la taquilla. El anillo comprado sigue funcionando sin corriente.
- Las piezas del mundo son comunes a todos los mapas (`src/zombies/maps/shared/`):
  la taquilla de anillo (`RingLocker`), el banco de taquillas que le deja hueco
  (`LockerBank`), el armario de arma especial (`WeaponStation`), el
  interruptor (`PowerLever`), la electricidad (`MapPower`)
  y los solidos de atrezo (`addSolidProxy`), todos sobre un `MapBuildKit`. Un
  mapa nuevo solo da su colocacion y su look (medidas, materiales, carteles);
  Station 33 lo hace en `station33/Station33Machines.ts`.
- Las maquinas suenan como las de bebidas: `ZombiesRings` sigue cada frame a
  la mas cercana con electricidad en la planta del jugador y
  `AudioSystem.setRingJingle` mantiene un unico bucle con la melodia de su
  anillo (`RingDefinition.jingle`, en `RingJingleTunes.ts`; volumen, paneo y
  apagado por distancia y orientacion, sin allocations salvo al cambiar de
  melodia), callado en intro, pausa, derrota y final. El MP3 de cada melodia
  (`sampleFile`, p. ej. `ring_machine_jingle.mp3`) sustituye al tono
  procedural si existe.
- El anillo se ve en el dedo de la mano derecha en primera persona
  (`HandRings`, hijo del hueso de la falange, sin tocar la pose ni subir nunca
  hacia la mira); brilla con su esmalte al ponerselo y al dispararse y se apaga
  gastado.
- Al comprar un anillo las manos se lo ponen (`RingDonning`, 2,2 s): el arma
  baja, la mano derecha sube abierta, la izquierda suelta el arma, lleva el
  anillo a la punta del dedo y lo desliza hasta su sitio, donde destella, y
  ambas vuelven al arma. Es un `MeleeArmDriver` con `SupportArmDriver` para
  la mano izquierda (`ViewArms`); mientras dura no se dispara, ni se apunta,
  ni se usa el cuchillo o la mascara. Solo presentacion: el efecto rige desde
  la compra. Recargar no repite la animacion. `Game.prepare` los muestra todos para compilar sus shaders.
- El HUD y la pausa muestran un icono por anillo equipado, tambien en movil.
  Los anillos gastados se atenuan.
- Activar `MOTDRULES` no concede anillos automaticamente; la consola permite concederlos. Reiniciar los retira.
- Solo individual: el cooperativo no los usa.

## Cooperativo

El alcance, la autoridad, el combate, la pausa y los limites de red se describen en [cooperativo](MULTIPLAYER.md#alcance-y-límites). Las fronteras de los modos estan en [arquitectura](ARCHITECTURE.md#responsabilidades).

## Rendimiento

Pools conocidos: balistica 32, agujeros 96, casquillos 24, chispas 16, humo 24,
pasos 8 y drops de cargador 12. No se crean objetos en loops criticos.

`DeviceProfile` fija una calidad Baja/Media/Alta/Ultra Max: la elegida en Ajustes
desde el menu principal (guardada en `localStorage`) o, con Auto (por defecto),
la que decide `AutoQuality`. Ultra Max solo se ofrece y aplica donde la
clasificacion del dispositivo por navegador permite Alta; las preferencias
guardadas como `ultra` conservan su eleccion con el nombre `ultraMax`.
La calidad decide pixel ratio maximo (1/1,5/2),
efectos reducidos, anisotropia y luces puntuales; los controles tactiles
siguen dependiendo solo del dispositivo. Se aplica al empezar la siguiente
partida.

Auto clasifica el dispositivo sin benchmark a partir de pistas que pueden
faltar: tactil o no, memoria y nucleos que exponga el navegador, pixeles de
pantalla al pixel ratio maximo y un contexto WebGL de prueba (`GraphicsProbe`:
WebGL2, tamano maximo de textura, si el navegador solo concede WebGL con
penalizacion grave y si el renderer es por software). Un dato ausente no
penaliza a un escritorio, pero impide Alta en un movil. Ultra Max nunca se
elige en Auto. El nivel se guarda con una huella de esas pistas y se reutiliza
mientras no cambien. En partida, `AutoQualityGovernor` ignora los primeros 10 s
y los 3 s tras cada pausa, y juzga ventanas de un segundo: una es lenta si va
por debajo de 48 fps con la resolucion dinamica ya reducida, o si solo
aguanta con la escala al 60 % o menos. Con 24 lentas de las ultimas 30 pide
una unica bajada, que se guarda y se aplica en la siguiente partida, sin
recompilar nada en la actual. Nunca sube de nivel por si sola. Durante el juego, `DynamicResolution` baja la resolucion por pasos
del 10 % (minimo 50 %) si la media de un segundo cae de 50 fps, y la sube al
recuperar 57 fps; un intento de subida fallido duplica la espera del
siguiente y una bajada que no acelera el frame se deshace, porque el cuello
no era la GPU. `?debug` muestra la escala actual.

Ultra Max (`useAdvancedRendering`) suma a Alta estas capas, todas en
`src/rendering/`:

- `LampShadows`: sombras en tiempo real de las dos lamparas que mas pesan
  para el jugador (en los demas niveles ninguna luz proyecta sombra). El
  numero de lamparas con sombra es fijo, sus mapas se mueven de una lampara a
  otra y se refrescan por turnos, uno por frame; un relevo exige ir claramente
  por delante durante un rato, asi que ni el parpadeo ni un fogonazo lo
  provocan.
- `PostProcessing`: la escena se dibuja con MSAA en un buffer HDR; despues
  `AmbientOcclusion` oscurece esquinas y contactos a partir de la profundidad
  del propio frame (el arma en primera persona queda fuera tambien al
  reconstruir normales y filtrar la oclusion). El bloom se reserva a luces
  por encima del blanco lineal en HDR (al extremo alto del rango si la GPU
  necesita el buffer de ocho bits); `FilmOutputPass` aplica el tone mapping,
  nitidez y un tratamiento suave de vineta, aberracion cromatica y grano.
  Las siluetas de compra en pared usan un material propio de menor emision
  y reflejo, conservando el relieve y las aberturas del arma.
- `ReflectionProbe`: suma al entorno generico una captura cubica de la sala
  alrededor del jugador, repartida a una cara por frame. Metal y cristal
  reflejan sus lamparas y su fuego y la sala devuelve luz rebotada, sin perder
  la luz ambiente con la que se equilibro cada mapa: la intensidad de entorno
  sigue siendo del mapa y la captura se amplifica para compensarla.
- `SurfaceDetail`: microrrelieve procedural (normal, rugosidad y cavidades) en
  los materiales de las armas en primera persona y de los zombis con modelo
  GLB. Las superficies opacas horneadas de los mapas reciben una capa mas
  suave sobre sus mapas de normales y rugosidad, con el mismo volumen de
  ruido compartido; no se aplica a los decals ni a los brillos sin iluminar.
- `MuzzleFlare` (`src/weapons/`): las armas de polvora cambian los sprites de
  fogonazo por una llama de 32-60 ms con nucleo volumetrico blanco
  amarillento, lenguas naranjas hacia delante y turbulencia animada distinta
  en cada disparo, segun el preset de su cartucho (`config/muzzleFlares.ts`).
  Su mezcla alfa limita la acumulacion de brillo; la Barrett suma los chorros
  laterales del freno, alineados con el canon. La luz del disparo dura lo mismo
  que la llama y la sonda de reflejos no la captura. Las armas de energia y el
  ФАКЕЛ-33 no cambian.

Ademas sube el presupuesto de luces puntuales a ocho, la anisotropia y las
particulas ambientales. `?gfx-off=shadows,occlusion,reflections,film` apaga
capas sueltas para comparar su efecto y su coste.

Station 33 mantiene visibles solo las luces puntuales que caben en ese mismo
presupuesto (`POINT_LIGHT_BUDGET`): las de la sala donde esta el jugador, por
prioridad, y las de las demas para completar; el cambio de sala espera a que el
jugador cruce claramente la puerta. Fusiona su decoracion estatica en una
malla por material (`StaticMeshBatch`); columnas, torniquetes, taquillas,
mostrador, carro y bancos chocan con proxies AABB invisibles.

Burned Mansion fusiona los 17 peldaños visuales de la escalera en una sola
malla; la rampa caminable solo existe para raycasts y no se dibuja. Mantiene
un presupuesto local estable de luces puntuales segun la calidad: ocho en
Ultra Max, seis en Alta, cuatro en Media y tres en Baja. El ranking pondera intensidad nominal (sin el
parpadeo de bombillas ni fuegos) por alcance y distancia, con histeresis, para iluminar el hueco
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

### HUD de rendimiento

`?debug` lo muestra desde el inicio. Con `MOTDRULES` es opcional: empieza
oculto y la consola lo muestra u oculta con `stats on|off` (o su tarjeta);
reiniciar lo oculta. Es un panel de diagnostico arriba a la derecha,
debajo de pausa y separado de las notas de objetivos. Agrupa cadencia, escala
del perfil con resolucion interna en pixeles, dibujo del ultimo frame y
recursos registrados por el renderer. Los textos y numeros siguen el idioma
del juego. Geometrias y texturas son recuentos, no memoria en MB; llamadas y
triangulos describen carga enviada, no tiempo GPU ni un cuello de botella.

La cadencia usa intervalos reales sin el limite del delta de simulacion,
incluidos los parones largos. Muestra FPS medios, tiempo medio, P95 y peor
frame de un historial de hasta 120 frames; su duracion varia con la cadencia.
P95 es el tiempo que no supera el 95 % de las muestras. La grafica conserva
el orden de los frames y recorta en 50 ms; el peor frame conserva el valor
completo. La referencia explicita es 60 FPS / 16,7 ms: el estado acompana los
FPS redondeados con verde desde 60, ambar de 30 a 59 y rojo por debajo de 30,
sin afirmar que sea el presupuesto propio de cada dispositivo.

El panel refresca cada 250 ms reales de partida. Al detener la simulacion
conserva la ultima muestra marcada como pausada; al reanudar descarta el
intervalo de reanudacion y empieza un historial nuevo. En pantallas bajas
compacta las filas y omite la grafica y las explicaciones para conservar los valores.
Fuentes: [medicion](../src/core/FramePerformance.ts) y
[presentacion](../src/ui/DebugStats.ts). Para medidas comparables entre
dispositivos, seguir el [protocolo manual](PERFORMANCE_BASELINE.md#protocolo-manual-de-escritorio-y-android).

## HUD y estadisticas de partida

El hitmarker solo aparece con impactos confirmados. El headshot es dorado y,
cuando el modo ya sabe que el impacto mato (individual y anfitrion), el
marcador es mas grueso y dura algo mas. Los impactos a menos de 50 ms se funden
en uno (`HitmarkerThrottle`) salvo que el nuevo sea mas fuerte, de modo que el
fuego automatico, las balas perforantes o las cadenas no saturan la pantalla.

Al recibir un golpe con atacante conocido (zombi en individual y cooperativo,
via el `attackerId` que el anfitrion ya enviaba), ademas del destello rojo un
arco rojo alrededor de la mira apunta hacia el atacante y gira con la vista
(`DamageDirections`). Hasta cuatro a la vez; los golpes repetidos del mismo
atacante refrescan su arco, que se desvanece en algo mas de un segundo. Los
golpes sin origen (jefe, evacuacion) solo muestran el destello.

Al volver al menu se limpian los anuncios, destellos y la proteccion azul del
HUD compartido para que no reaparezcan al empezar otro mapa.

Cuando un mapa termina de construirse y calentar la GPU, la pantalla de inicio
muestra sobre la escena una tarjeta compacta, baja y lejos de la mira, con el
nombre del mapa, «LISTO PARA SOBREVIVIR» y la accion de empezar segun el
dispositivo; sigue siendo el gesto que pide Pointer Lock o pantalla completa y
se desvanece al empezar. Los controles ya no se listan ahi: el boton CONTROLES
de la pausa y VER CONTROLES en Ajustes abren un dialogo por categorias
(movimiento, combate, interaccion, otros) para PC o movil y mando, generado desde
[ControlsCatalog](../src/ui/ControlsCatalog.ts), cuyos botones de mando salen de
`GamepadBindings`.

Los avisos de interaccion comparten una tarjeta oscura de alto contraste, con
accion, tecla o boton tactil y coste separados. La entrada despliega el marco
y un reflejo breve, seguido de dos pulsos en la tecla; se omiten con movimiento
reducido. Los requisitos bloqueados conservan su texto sin ofrecer una tecla.
En tactil, la tarjeta es el control de usar: tocarla interactua, incluidas las
acciones mantenidas. En Ajustes > Accesibilidad se pueden ocultar estos avisos; la preferencia se
guarda y se aplica al instante, sin desactivar las interacciones del juego, y no
oculta la tarjeta en tactil.

Los mensajes tienen dos niveles. El anuncio central (`HUD.showRoundBanner`)
queda para hechos de la partida: rondas, electricidad, evacuacion, jefe,
compañero y anillo radiante; su tamaño se ajusta al ancho de pantalla y los
titulos largos se parten en lineas equilibradas. La respuesta a una accion del
jugador (`HUD.showNotice`: falta de puntos, municion o granadas llenas, compra
no confirmada, anillo puesto o recargado, maquina cargando, arma mejorada) es
una tarjeta compacta bajo el aviso de interaccion, roja si se rechaza, con
tipografia responsive y fondo oscuro. Su duracion se adapta al titulo y al
detalle entre cuatro y ocho segundos ([politica de lectura](../src/ui/HudNotice.ts)),
con entrada y salida suaves; no retrasa los objetivos. La columna reserva las
zonas seguras y espacio para el HUD y los controles tactiles mientras aparece
la respuesta. Si el propio aviso ya explica por
que no se puede usar algo (puerta sellada, vitrina con muertes pendientes),
pulsar no repite el mensaje.

Los objetivos de los modos llegan al HUD como notas estructuradas
(`ObjectiveNote`: emisor, tarea y progreso vivo). Arriba a la izquierda queda
una nota por mision, con riel ambar o rojo si el evento es contrarreloj. Cada
tarea nueva (`ObjectiveAnnouncer`) se presenta antes en una tarjeta grande en el
tercio superior, que se abre desde el centro, se mantiene unos segundos y vuela
hasta su nota de la esquina. Nunca coincide con el anuncio central: espera a que
termine y, si aparece uno mientras se muestra, vuela en el acto a su nota. Las
tareas simultaneas se presentan por turnos. Distancia, reloj o lista de control
no vuelven a anunciarse. Un progreso medido (`ObjectiveGauge`, como el
desbloqueo de la compuerta) se dibuja como barra segmentada bajo la tarea, con
etiqueta, porcentaje y reloj; si se detiene, parpadea en rojo con franjas de
peligro. Una mision que termina, en la esquina o en la tarjeta,
se desvanece subiendo un poco antes de desaparecer, y la siguiente tarjeta espera
a ese fundido; una run nueva lo limpia al instante. Con movimiento reducido solo
hay fundidos.

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
Las garras tienen un borde iluminado y al avanzar la ronda se traza la nueva
marca con un brillo que se apaga; en rondas altas se animan las tres garras y
el numero exacto. El efecto solo responde a aumentos de ronda y respeta el
movimiento reducido, sin cambiar la distribucion del panel.

Cada subida del saldo lanza sobre el contador un "+N" que salta y se desvanece
mientras el contador late; las bajas y, sobre todo, headshots y cuchillo se
muestran mas grandes y brillantes ([PointsPopups](../src/ui/PointsPopups.ts)).
Gastar o reiniciar no lo dispara, y el invitado lo ve igual a partir de su saldo replicado.

En dispositivos tactiles el panel permanece pequeno abajo a la izquierda, lejos
de la pausa y de los botones de accion, con ronda, puntos, vida y bajas; headshots y faroles se consultan
en la pausa para dejar libre la vista de combate.

La pantalla de derrota muestra la ronda alcanzada y permite reintentar el mapa
o volver al menu principal. El titulo adapta su tamano a la pantalla y su
animacion de entrada mantiene la distribucion del texto, sin cambiar el
espaciado entre letras. Respeta el movimiento reducido del sistema.
En cooperativo solo el anfitrion puede reintentar;
el invitado puede volver al menu o esperar al reinicio del anfitrion.
