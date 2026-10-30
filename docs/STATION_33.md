# Station 33: direccion de arte y enfoque del mapa

Guia para retomar Station 33 sin perder su identidad. Describe la intencion
(que se quiere transmitir y por que); las medidas, coordenadas y tablas viven en
`src/zombies/maps/Station33Config.ts` y en los builders de
`src/zombies/maps/station33/`. Si el codigo y esta guia discrepan, manda el
codigo: actualiza la guia.

## Que es

- Estacion de metro sovietica profunda, abandonada tras una evacuacion que
  fracaso. La salida a la superficie se hundio y nadie volvio. El lema del mapa
  es "Antigua estación abandonada en la época de la Guerra Fría...pero que
  esconde secretos que nunca deberían ser revelados."
- Mapa premium y solo individual. Mientras no haya pagos, premium solo cambia la
  presentacion (tarjeta dorada, insignia, intro). Aparece bloqueado y
  temporalmente requiere un correo de beta para abrirse, tambien con
  `?map=station-33` y en desarrollo; consulta [acceso de beta](../public/beta/README.md).
  Debe notarse superior a Burned Mansion desde el primer segundo, sin
  degradar el modo individual ni introducir dependencias del modo con el mapa.
- Se construye por fases. La Fase 1, el vestibulo, es una partida completa:
  cuatro entradas con chapas de acero, la PPSh-41 (1250 / 625) en pared
  y la escalera mecanica sellada. La Fase 2 abre la consigna tras la primera
  puerta de pago, la Fase 3 las cocheras tras la segunda y la Fase 4 la sala
  de maquinas (la subestacion) tras la tercera. La escalera mecanica sigue
  sellada: bajarla es la fase siguiente. Aparte de las fases, el puesto de
  milicia (la puerta mas cara, 3000) es la tercera salida del vestibulo. Cada fase
  debe ser jugable por si misma y nunca abrir puertas hacia el vacio. El plan
  de ejes (hacia el norte y hacia abajo) esta documentado al principio de
  `Station33Config.ts`.

## Pilares de ambientacion

1. **Frio, humedo y profundo.** Nada de fuego, humo ni madera quemada (eso es la
   mansion). Aire verde grisaceo, niebla densa, filtraciones, goteo y vapor.
   La luz de entorno casi desaparece: iluminan las lamparas del propio lugar.
2. **Grandeza sovietica en ruinas.** Marmol frio, granito ajedrezado, bronce,
   estuco, boveda de cañon rebajada con nervios, mosaico de esmalte azul sobre
   la escalera. Todo fue solemne y ahora esta manchado, desconchado y roto.
3. **Luz electrica que falla.** Los fluorescentes zumban y tartamudean en
   circuitos desfasados; los apliques ambar respiran; la lampara roja de
   emergencia, a bateria, nunca se apaga. Los apagones y temblores son eventos
   del mapa, no ruido aleatorio permanente.
4. **La evacuacion como historia.** Maletas caidas, octavillas pisoteadas,
   vallas arrancadas, puertas de cristal ahogadas por escombros bajo el cartel
   luminoso de "salida a la ciudad", sangre y yeso caido. El escenario cuenta
   lo que paso sin texto en pantalla.
5. **Una estacion viva aunque muerta.** Movimiento barato y constante: polvo en
   suspension, gotas que caen en charcos, cables cortados y una lampara colgante
   que se balancean, vapor de una tuberia rota. Un tren lejano lo agita todo.

## La consigna (Fase 2)

- La consigna de equipajes de la estacion: lo que los evacuados entregaron y
  nadie volvio a recoger. Un pasillo holgado (5,8 m, para que la horda y el
  jugador se crucen) entre los pasadizos de las rejillas del vestibulo, que se
  separaron para hacerle sitio, y una sala de taquillas de acero con numeracion cirilica ("Б-17"), puertas
  colgando abiertas, un mostrador con la persiana bajada, un carro de mozo y
  maletas por el suelo. Techo plano y bajo de servicio y azulejo vidriado
  amarillento por las filtraciones: mas pobre y mas humeda que el vestibulo.
- Se entra por una puerta de chapa de acero (750 Points) junto al banco del
  muro este; con ella cerrada la sala no existe para el jugador ni para los
  zombis. Al abrirla despiertan sus dos entradas (escalera de mozos sepultada
  y una rejilla), la Mystery Box y la taquilla del anillo. El arma de pared
  de la consigna es la MP5 (1000 / 500), en el muro norte del pasillo.
- La taquilla del anillo, bajo la placa "БЮРО НАХОДОК" (objetos perdidos), es
  el foco al final del eje del pasillo: abierta, con un cojin de terciopelo y
  la alianza brillando con su propio esmalte. Tras la compra queda vacia y
  apagada; si el anillo se gasta, el cojin vacio vuelve a latir para pedir la
  recarga, hasta que la tercera recarga de la run la deja agotada hasta reiniciar.
  Ese brillo es de material emisivo, nunca una luz.
- Alrededor de la taquilla suena en bucle una musica de maquina, como el jingle
  de las bebidas de CoD Zombies: se oye a pleno a su lado y se apaga a unos
  10 m, nunca desde el vestibulo. Hoy es una cajita de musica procedural
  provisional; `public/assets/audio/ring_machine_jingle.mp3` la sustituye en
  cuanto exista (pista libre de derechos, en bucle limpio).

## Las cocheras (Fase 3)

- La via muerta de apartado donde se quedaron los trenes de la evacuacion:
  la sala mas amplia del mapa, una nave de dovelas de hierro fundido (anillos
  de tunel con pestañas, pernos, oxido y filtraciones) bajo una boveda
  rebajada, con un zocalo verde pintado y bandejas de cables a lo largo de
  los muros. Mas industrial, oscura y mojada que el vestibulo; el marmol se
  queda al otro lado de la puerta.
- Se entra por una puerta de servicio («СЛУЖЕБНЫЙ ПРОХОД», 1250 Points) en el
  muro norte del vestibulo, al este de la escalera. Al abrirla, lo primero que
  se ve es la cabina del tren oeste: faros muertos, pilotos rojos a bateria y
  la caja de luz «ПОСАДКИ НЕТ» (no hay embarque) parpadeando. Es la imagen de
  la zona; cualquier cambio debe preservarla.
- Dos vias a lo largo de Z que terminan en toperas sobre el anden de
  entrada. El tren oeste se pega al muro, tiene una puerta abierta con
  maletas caidas y su remolque se pierde en un tunel hundido que el propio
  vagon tapona. El vagon este descarrilo y se inclina sobre su via: deja un
  carril de paso a cada lado y espacio en ambos extremos, asi que la nave es
  un circuito para entrenar a la horda alrededor del tren.
- Tres entradas: el postigo del germozatvor (puerta hermetica de defensa
  civil, «НЕ ОТКРЫВАТЬ») al final de la via este, con su baliza roja; una
  rejilla y la puerta de la subestacion en el muro este. La M60 (2500 / 1250) espera en el muro del
  anden, entre las dos toperas. La Mystery Box sigue en la consigna.
- En el mismo muro, al este de las toperas, estan las taquillas de la
  tripulacion bajo la placa «ДЕПО»; en medio, la taquilla abierta del anillo
  de Prestidigitacion (3500). Sin electricidad esta muerta: ni brillo ni
  musica, y el aviso dice que hay que encender la electricidad. Encendida,
  brilla en verde y suena su propia melodia, un paso de prestidigitador en re
  menor, distinta de la cajita de musica de la consigna.
- Antes del interruptor general hay un atajo: un rayo de la ZEUS-77 (de la Mystery
  Box) contra la taquilla la alimenta un minuto. Se ve el arco hasta la
  taquilla, que se enciende y, en sus ultimos 10 s, tartamudea como un
  fluorescente antes de morir.
- Los vagones son de la epoca: esmalte azul desvaido con franja crema,
  ventanas rotas que dejan ver un interior completamente negro, numero de
  ruta 33. Nada de pintadas ni colores vivos; el unico color intenso es el
  rojo de las luces a bateria.

## La sala de maquinas (Fase 4)

- La subestacion de traccion que alimentaba la estacion, al fondo de las
  cocheras: una puerta de pago (1500, placa «ТЯГОВАЯ ПОДСТАНЦИЯ») entre el
  tunel hundido y el germozatvor abre una galeria de servicio baja que
  desemboca en la sala. Nadie ha bajado desde la evacuacion: telaranas en
  cada rincon, aceite bajo las maquinas, el libro de guardia por el suelo.
- Mas tecnica que las cocheras: yeso sobre zocalo verde, techo plano de
  hormigon bajo vigas de acero, bandejas de cables y tuberias. Dos grupos
  motor-generador sobre bancadas (volante con franjas de peligro, colector
  de cobre), dos transformadores de aceite con aisladores de porcelana y
  cuadros electricos con relojes y seccionadores. El suelo es de baldosa
  metlaj (terracota y arena, 15 cm) empapada de aceite, con baldosas rotas y
  arrancadas, a la densidad del granito del vestibulo; sobre ella, la zanja de
  cables del pasillo con chapa estriada, lineas de seguridad alrededor de los
  motores y la alfombra dielectrica ante los cuadros. Arriba, barras de cobre
  colgadas que bajan a los transformadores; en los muros, placas «СТОЙ!
  НАПРЯЖЕНИЕ», la etiqueta «НЕ ВКЛЮЧАТЬ! РАБОТАЮТ ЛЮДИ» olvidada en un
  seccionador y la mnemosquema de la red, cuyos pilotos verdes solo se
  encienden con la red (los rojos, a bateria, marcan alimentadores
  muertos). Un pasillo central lleva
  de la galeria al interruptor; alrededor de los motores hay carriles para
  dar vueltas a la horda. Dos entradas: una rejilla en el muro este y la
  puerta del tunel de cables («ВХОДА НЕТ») en el norte.
- Al final del eje de la galeria, entre los cuadros, el interruptor general
  («ГЛАВНЫЙ РУБИЛЬНИК»): un seccionador de cuchillas oxidado sobre pizarra,
  con las cuchillas colgando abiertas y cubierto de telaranas; una cruza los
  contactos y otras van de las cuchillas a la placa. Sin corriente, la sala
  solo tiene el rojo de su baliza a bateria y un fluorescente agonizante.
- En el muro sur, al este de la galeria, el armario de descontaminacion
  («ФАКЕЛ-33 / ДЕЗАКТИВАЦИЯ», placa ocre de peligro): un armario de acero
  abierto con la ФАКЕЛ-33 colgada de dos ganchos y tres cristales de repuesto
  en su bandeja, el equipo experimental que nadie llego a retirar. Sin
  electricidad esta muerto; con ella los cristales y su piloto laten en el
  rojo del nucleo (material emisivo, nunca una luz). Para habilitarlo, cada
  partida exige recuperar el cristal de arranque: con la red encendida un
  walker de la horda se convierte en portador, marcado por un cristal rojo
  sobre la cabeza, nucleo en el pecho y anillos de energia. Al morir deja un
  cristal persistente que se recoge y se instala gratis en el armario. El HUD
  mantiene el paso actual con flecha y distancia en una nota discreta de la
  esquina, sin banners centrales; la confirmacion de desbloqueo permanece
  hasta comprar el arma. Las bajas en las entradas
  dejan el cristal al lado jugable de la barricada. Vende el arma (3500) y
  despues sus cristales (1750). Es la unica fuente de fuego del mapa: el
  pilar de "nada de fuego" se refiere al escenario, no al arsenal del
  jugador.
- Accionarlo es gratis y una sola vez por partida: la palanca chirria, las
  cuchillas suben rompiendo las telaranas y cierran con un chispazo. En ese
  instante la estacion entera recupera la red: las luces se apagan y vuelven
  circuito a circuito (como en la intro), los motores arrancan y hacen temblar
  todo, y desde entonces todo esta mas iluminado y estable: luces y lamparas
  mas intensas, fluorescentes que apenas tartamudean, los tubos y lamparas
  del circuito `mains` encendidos, mas luz de relleno y menos niebla. Las
  maquinas (las taquillas de anillos y la futura potenciadora de armas) se
  ven mucho mas iluminadas: brillo multiplicado, bombilla de su color
  encendida con destello y un charco de luz en el suelo. Todo con materiales
  emisivos y aditivos, nunca luces nuevas.
- Los multiplicadores viven en `STATION33_MAINS`; cualquier maquina nueva
  (Pack-a-Punch incluido) debe leer la `MapPower` del mapa y aplicar
  `machineGlowBoost` como las taquillas, y escribirse en `shared/` para que
  otros mapas la reutilicen (Station 33 es el mapa base).

## El taller de mantenimiento

- Nave de reparaciones al norte de electricidad (unos 12 x 12 m, techo de
  4,2 m), por una puerta de chapa de 2000 Points a la izquierda de los
  cuadros. Queda fuera del eje de la escalera y su muro este no toca el
  pasadizo del tunel de cables. Yeso amarillo con zocalo gris rematado en
  franja de peligro, suelo de hormigon manchado de aceite.
- En el centro, un bogie de recambio calzado sobre un tramo de via bajo un
  puente grua aparcado, cuyo gancho se balancea (`Station33Atmosphere`);
  lineas de peligro marcan la zona. A cada lado queda un carril de al menos
  3 m para la horda. Contra los muros: banco con tornillo, caja de
  herramientas, flexo ambar y tablero de herramientas con siluetas vacias;
  taladro de columna; estanteria de piezas; carro de soldadura y bidones.
  Polvo, goteras, cable colgante, telaranas, sangre desde la entrada de
  servicio y una baliza roja junto a ella. Luz ambar de orientacion y del
  banco; fluorescentes y luz de red al encender la corriente.
- Entre las taquillas espera Tiro doble: anillo amarillo en el indice,
  compra unica de 3000 con corriente. Duplica la cadencia y suma un 20 %
  de dano con armas. Una entrada de mantenimiento propia despierta al
  abrir la puerta, bajo la placa «МАСТЕРСКАЯ» sobre las taquillas.

## El puesto de milicia

- La comisaria de la estacion («МИЛИЦИЯ»): el sitio donde tendria sentido
  guardar proteccion y armas, y por eso vende la Armadura y la AK-47. Es la
  tercera salida del vestibulo, por su muro oeste y en linea con los tornos.
  La puerta (3000) da
  directamente a la sala: comparte el muro del vestibulo, cubierto por su
  lado con yeso y el zocalo verde de oficina sovietica sobre metlaj. Es una
  sala amplia (unos 11 x 12 m) con techo de 3,4 m bajo vigas de hormigon.
- Al fondo, en el eje de la puerta, las taquillas de pruebas bajo la placa
  «ВЕЩЕСТВЕННЫЕ ДОКАЗАТЕЛЬСТВА»; en medio, la taquilla abierta del anillo
  Armadura (rojo, 2500), que necesita electricidad como la de las cocheras.
  Una alfombra roja lleva de la puerta a ella, y sobre la placa hay una
  estrella de rubi luminosa en el circuito `mains`: se enciende (con su luz
  roja) al accionar el interruptor general, igual que la taquilla.
  La AK-47 (1750 / 900) esta en el muro norte, por encima del zocalo.
- El rincon rojo, en el muro norte: pancarta «СЛУЖИМ НАРОДУ», estrella de
  esmalte en relieve, mesa con pano rojo y libros de registro, y dos
  banderas en sus pies. Solo estrellas y rotulos genericos, sin emblemas
  reales ni retratos (como el resto de la cartelera).
- La historia: la mesa del oficial de guardia con el telefono y el libro de
  guardia, su silla volcada y los partes por el suelo; la mesa de
  interrogatorios con maquina de escribir y cenicero bajo una lampara
  colgante; la celda de detencion («КПЗ») del rincon suroeste con la puerta
  de barrotes abierta de par en par, un jergon y un cubo; un armero con
  cascos y escudos antidisturbios; dos archivadores, una caja fuerte junto
  a la puerta, el tablon «ДОСКА ПОЧЁТА» con los marcos vacios sobre un
  radiador, un reloj parado sobre la puerta, el cuadrante de guardias y
  carteles («МИЛИЦИЯ — НА СТРАЖЕ ПОРЯДКА», «БУДЬ БДИТЕЛЕН!» y los de busca
  y captura a los que les arrancaron las fotos).
- Fluorescente inestable sobre la mesa de guardia, la lampara de
  interrogatorio en un circuito que falla y la lampara roja a bateria sobre
  la celda; los demas tubos son de la red y solo se encienden con el
  interruptor general (uno de la celda esta roto). Los zombis entran por la
  puerta trasera del muro sur.

## Anillos

- Los anillos son las perks de Zeroed: alianzas que los evacuados dejaron en
  las taquillas. Uno por dedo de la mano derecha, cada uno en un dedo fijo,
  visibles en primera persona; el HUD solo apoya.
- Su brillo es un acento frio (turquesa para Resurreccion, verde para
  Prestidigitacion); la Armadura es roja por decision del usuario, la unica
  calida. El dorado sigue reservado a lo premium. Un anillo
  gastado se queda en el dedo, sin brillo.
- Catalogo: anular, Resurreccion (salva una muerte, en la consigna); menique,
  Prestidigitacion (recargas al doble de velocidad, en las cocheras, exige
  electricidad); corazon, Armadura (vida maxima doble, en el puesto de
  milicia, exige electricidad). Previstos: indice, Doble
  impacto (dano y cadencia); pulgar, un anillo de utilidad (por ejemplo,
  tercera arma). La siguiente maquina prevista es el Pack-a-Punch.
- Cada taquilla toca la melodia de su anillo. Las de ahora son provisionales
  y procedurales (`RingJingleTunes.ts`); un MP3 libre de derechos con el
  nombre de su `sampleFile` en `public/assets/audio/` sustituye a cada una.

## La horda

- Los zombis son la guarnicion que defendia la estacion y los civiles que no
  salieron: fusileros de la guerra (pilotka y capote enrollado), infanteria con
  casco de acero, oficiales de campo con gorra de plato y correaje, centinelas
  de invierno con capote gris y ushanka, veteranos con chaqueta acolchada,
  capucha bajo la pilotka, bufanda, cartucheras, cantimplora y morral,
  oficiales de desfile con guantes
  blancos y medallas, y evacuados de paisano. La lista vive en
  `STATION33_ZOMBIE_SKINS`; el catalogo, en `ZombieSkinCatalog.ts`.
- Toda la horda tiene los ojos rojos (`STATION33_ZOMBIE_EYES`, el rojo de
  Brutus): el unico color vivo del zombi, que corta la niebla verde.
- Gorras y cascos ceñidos al craneo y en tonos apagados: deben leerse como
  parte del uniforme, no destacar sobre la silueta.
- Uniformes desvaidos y sucios, nunca colores vivos: el rojo de bandas y
  estrellas y el dorado de desfile son acentos pequenos. Insignias genericas
  (estrellas, franjas); nada de emblemas reales ni simbolos politicos.
- Para revisarlas sin jugar: `zombie-viewer.html?skin=all&redEyes=1`.

## Paleta y materiales

- Fondo y niebla casi negros con matiz verde; hemisferica tenue verde gris.
- Luces: blanco verdoso fluorescente, ambar calido en apliques, rojo de
  emergencia. El dorado queda reservado a lo premium (tarjeta, intro, insignia)
  y a los numeros del arte de menu; no se usa como luz del escenario.
- Superficies: marmol claro con vetas, granito gris y rojo gastado por el paso,
  yeso de boveda con cercos de humedad, hormigon oscuro en los pasadizos, acero
  verde militar desconchado hasta el oxido, bronce en marcos y barandillas.
  En las cocheras: dovelas de hierro fundido, solera de hormigon con manchas
  de aceite, balasto oscuro, esmalte azul desvaido de los vagones y franjas
  de peligro gastadas en toperas y germozatvor.
- Todas las texturas se generan en codigo (`Station33Materials.ts`); el mapa no
  depende de assets externos. Mantenerlo asi salvo decision explicita.

## Señaletica

- Cirilico diegetico: forma parte del arte, nunca se traduce ni se usa como UI.
- Iconografia generica (estrellas, rayos, letras, teselas). Prohibido retratos,
  emblemas reales o simbolos politicos identificables.
- Placas esmaltadas, carteles de papel arrancados y cajas de luz; las cajas de
  luz siguen a los circuitos de iluminacion.

## Sonido

- Megafonia que crepita, tren lejano que hace temblar la boveda y caida de
  tension: eventos de datos con temporizador irregular y voz procedural en
  `AudioSystem`. Un `sampleFile` puede sustituir la voz por un MP3.
- Musica de partida propia en bucle: «Creepy Halloween Music», de Tunetank
  (Pixabay). Origen y licencia en `ASSETS.md`; credito visible en el menu y
  en los creditos finales.

## Presentacion premium

- Tarjeta del menu con arte SVG propio (tunel, tubos turquesa, puerta con
  franjas de peligro, "33" dorado) y brillo dorado de acceso premium.
- Intro de 8 s al entrar por primera vez en la partida: camara real en la
  escena, apagon con solo la luz de emergencia, tren que sacude la boveda,
  circuitos que se encienden uno a uno, grua sobre la nave y titulo dorado
  "STATION 33" con "СТАНЦИЯ 33" y lema. Aterriza en los ojos del jugador; se
  salta con cualquier tecla, boton tactil o pausa. Sistema descrito en
  `GAME_SYSTEMS.md` (`ArenaIntro`, `IntroCinematic`, `#intro-screen`).
- Cualquier momento premium nuevo (finales, revelaciones, nuevas zonas) debe
  sentirse cinematografico y diegetico antes que con mas UI.

## Restricciones tecnicas que sostienen el ambiente

- Pocas luces reales: cada sala tiene su lista priorizada de luces puntuales
  y la sala donde esta el jugador ocupa primero el presupuesto de calidad (las
  de las demas completan); el resto brilla con materiales emisivos que siguen a
  su circuito. Un numero fijo de luces visibles evita recompilar shaders.
- La geometria estatica se agrupa en un unico batch; cada mueble solido tiene
  un proxy AABB simple que para balas, zombies y jugador; las columnas usan dos
  (zocalo y fuste) para que impactos y sangre queden sobre el marmol visible.
  Cada proxy declara que caras admiten sangre (`stainFaces`).
- La decoracion del suelo queda por debajo de la altura de obstaculo de los
  zombies y lejos de las entradas; los pasadizos de spawn quedan libres.
- Los perfiles de efectos reducidos (movil) recortan sombras, particulas y
  luces, pero no deben perder la lectura del lugar (emergencia roja, tubos,
  niebla).

## Directrices para continuar

- Lee `AGENTS.md`, `DECISIONS.md` y `GAME_SYSTEMS.md` antes de tocar el mapa.
- Cada zona nueva tiene su builder en `station33/` y sus datos en
  `Station33Config.ts`; la arena solo orquesta. Luz y atmosfera son sistemas
  propios: amplialos, no los dupliques.
- Respeta el plan de ejes: lo existente no se mueve; las zonas nuevas se abren
  con puertas de pago o la escalera, y dejan libres los pasadizos de spawn.
- La Mystery Box vive en la consigna. Aun no hay final.
- Nada de recursos que rompan el tono: fuego, colores saturados, humor,
  señaletica traducida o UI que explique lo que el escenario puede mostrar.
- Ningun solido puede superar 20 m de planta (el filtro de obstaculos de los
  zombis lo ignoraria y abriria un paso fantasma): parte los muros largos.
- Valida con `npm run typecheck` y `npm test` (`tests/station33.test.ts` y
  `tests/mapIntro.test.ts` cubren disposicion, puertas, rutas, luces,
  ambiente e intro). Para revisar una zona sin jugar hasta ella usa el visor
  de mapas (`tools/viewers/map-viewer.html`).
