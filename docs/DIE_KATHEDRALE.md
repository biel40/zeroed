# Die Kathedrale: direccion de arte y enfoque del mapa

Guia para retomar Die Kathedrale (La Seu de Palma) sin perder su identidad.
Describe la intencion; las medidas, coordenadas y tablas viven en
`src/zombies/maps/DieKathedraleConfig.ts` y en
los builders de `src/zombies/maps/dieKathedrale/`. Si el codigo y esta guia discrepan,
manda el codigo: actualiza la guia.

## Que es

- La catedral gotica de Palma de Mallorca, de noche y tomada por los muertos.
  Una interpretacion reconocible, no una reproduccion a escala: las naves miden
  aproximadamente la mitad que las reales y se conservan las proporciones que
  la hacen inconfundible.
- Mapa individual y premium, visible en el menu como Die Kathedrale. Usa
  el id `die-kathedrale` (tambien en `?map=die-kathedrale`) y las rutas
  `DieKathedrale`/`dieKathedrale`; producto y acceso se declaran en
  [el registro de mapas](../src/config/zombieMaps.ts). Comparte el acceso de
  [beta cerrada](../public/beta/README.md) con Station 33. Mientras sea
  `workInProgress`, las cuentas de desarrollo con permiso de prueba pueden
  abrirla desde el menu o por enlace directo. En un servidor local tambien se
  puede probar con el producto premium y `VITE_WIP_MAPS=true`.
- Se construye por fases, como Station 33. Cada fase debe ser una partida
  completa y nunca abrir puertas hacia el vacio. El plan de ejes esta al
  principio de `DieKathedraleConfig.ts`: el frente principal sobre z = 0, la nave hacia
  el norte (el este liturgico) y la plaza hacia el sur, sobre el mar.

## Pilares de ambientacion

1. **Escala gotica, siempre a la vista.** Lo primero que debe leerse es la
   altura: pilares octogonales muy esbeltos, boveda de cruceria de tres naves
   y la nave central muy por encima de las laterales. Ninguna division sube
   por encima de la cabeza: rejas, pretiles y escombros cortan el paso, nunca
   la vista. La niebla es fina a proposito para que la boveda se lea desde el
   suelo y el fondo de la nave se pierda.
2. **Piedra de Santanyi, muerta.** Sillares que fueron dorados, hoy grises de
   hollin y humedad. Nada de marmol frio (eso es Station 33) ni de madera
   quemada (eso es la mansion).
3. **Islas de luz, no una catedral iluminada.** Casi no hay luz de relleno:
   la piedra solo existe donde llega una llama o la luna. Los vitrales estan
   muertos salvo el roseton del frente y dos ventanales del este, que dejan
   un haz y un charco frio. Los candelabros de los primeros pilares dan luz
   calida al inicio; los siguientes se encienden suavemente al acercarse,
   cuando alguna de sus zonas contiguas esta abierta, y conservan la llama
   hasta reiniciar. La camara de la intro no los activa. Los altares, los
   votivos y la lampara roja del sagrario mantienen sus islas permanentes.
   Entre ellas debe quedar penumbra; el punto de inicio y las armas de pared
   necesitan una isla al alcance.
4. **Terror gotico contenido.** Algo terrible paso aqui y nadie lo explica:
   los muertos bajo sabanas en una capilla, bancos arrastrados y rotos,
   sangre que cruza cada reja alejandose de las puertas, telaranas, niebla
   baja en los rincones y ruidos raros y espaciados (hierro, viento, madera,
   golpes tras la sacristia). Nada sobrenatural, ningun susto de guion y
   poco atrezo: no es una mazmorra de fantasia.
5. **Palma alrededor.** La plaza es un mirador: la bahia bajo la luna, la
   muralla del mar, la silueta almenada de la Almudaina y Bellver al fondo.
6. **La horda de la catedral.** Todos los walkers visten a quienes guardaban
   el templo: monje encapuchado con capa corta y cuerda con borlas, sacerdote
   con alba de encaje y casulla carmesi bordada en oro, monja con toca y velo,
   guardian con cota de malla, botas altas y sobrevesta con cruz roja, y un
   obispo con casulla amplia ribeteada en oro y la mitra rota, el mas raro.
   La segunda coleccion suma un canonigo (roquete de encaje, muceta carmesi y
   birrete), un cantor (dalmatica azul con lirios de oro y libro al cinto), un
   dominico (habito blanco bajo capa y capucha negras), un peregrino (sombrero
   con concha, capa con cruz, zurron, calabaza y vendas en las piernas), un
   custodio (capa pluvial negra y oro, llaves y farol al cinto) y una abadesa
   (escapulario de brocado carmesi, toca, velo y baculo). Ninguna skin pasa
   del 15 % de la horda.
   Toda la horda tiene ojos azules con nucleo azul claro
   (`DIE_KATHEDRALE_ZOMBIE_EYES`); Brutus conserva el resto de su aspecto propio.
   Inspiracion de los siglos XIII-XV, tonos apagados que no compitan con la
   piedra, ropa sucia y rasgada; nada de armaduras de
   fantasia ni efectos sobrenaturales. Cada aspecto se reconoce por su silueta
   a distancia de combate. Los pesos son `DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES` en
   la [config](../src/zombies/maps/DieKathedraleConfig.ts).

## Fase 1: la nave (construida)

La nave se recorre por zonas, como las salas de Station 33, pero sin
paredes: dos lineas de reja la cruzan de muro a muro (la del trascoro, tras
el segundo tramo, y la del coro, ante el crucero) y pretiles cierran las
arcadas de la nave central. Cada reja de pago une dos zonas y despierta las
entradas de zombis de la que aun dormia.

| Zona | Que tiene | Se llega por |
| --- | --- | --- |
| Nartex (inicio) | Dos tramos tras las puertas mayores, abiertos a ambos lados solo en el primero. M14, dos entradas | - |
| Nave central | Bancos, barricada y los dos tramos despejados; sin entradas propias | Reja del trascoro (750) |
| Nave lateral oeste | Pasillo junto a los pilares, capilla de armas (PPSh-41) y capilla con ventana de zombis, puerta de zombis | Reja de la Almoina (1000) o reja lateral de la nave (750) |
| Nave lateral este | Capilla de los muertos, confesionario, capilla con ventana de zombis, puerta del Mirador; acaba bajo el derrumbe | Reja del Mirador (1000) o reja lateral de la nave (750) |
| Crucero y presbiterio | Ultimo tramo de muro a muro, altar, baldaquino, AK-47, sacristia | Reja del coro (1500) o reja del deambulatorio desde la nave oeste (1250) |
| Plaza | Mirador sobre la bahia, M60, Mystery Box, dos puertas de zombis | Postigo de las puertas mayores (1250) |

Las tablas exactas (rejas, capillas, entradas, luces y sonidos) estan en
`DieKathedraleConfig.ts`.

## Explanada, patio y campanario

La plaza conserva su papel de mirador sobre la bahía. El paso del Palau
rodea el lateral este hasta la explanada, donde el portal del Mirador abre
una vuelta hacia las capillas. Los contrafuertes de piedra marcan el ritmo
del muro y estrechan los pasos. El patio de la reja lateral reserva un nicho
de velas para el anillo de Prestidigitación.
La portada toma como referencia la fachada meridional y el umbral sobre el
mar de La Seu. [Portal del Mirador](https://blog.catedraldemallorca.org/opinion/joan-bauza/una-catedral-que-remite-a-otras/)

Desde el crucero, el caracol lleva a la cámara de campanas. Los soportes de
madera y las aperturas de piedra dominan la sala. En la cubierta, los
pretiles, pináculos y arbotantes mantienen la silueta gótica y enmarcan la
vista a los alrededores. El anillo de Tiro Doble está en el recorrido de la
terraza. [Sala de campanas de La Seu](https://catedraldemallorca.org/noticias/conoces-la-sala-media-de-la-catedral/) · [Terrazas de La Seu](https://catedraldemallorca.org/en/news/the-cathedrals-terraces-reopen-to-the-public/)

Consulta el [plano y las conexiones jugables](maps/die-kathedrale-topology.md)
para ver las rejas, los recorridos y la distribución de anillos.

## Catacumbas reales (construidas)

Bajo la catedral hay un complejo funerario de reyes, nobles y clerigos,
abandonado y olvidado. La catedral es grandeza y solemnidad; abajo, opresion:
techos bajos, pasillos estrechos que desembocan en camaras grandes, estatuas
yacentes a medio iluminar, sepulcros abiertos y silencio roto por ruidos que
no se entienden. Misma piedra que arriba, mas oscura, humeda y manchada; nada
de mazmorra de fantasia: arquitectura que podria sostenerse (muros de 0,6 m,
pilares compuestos, nervaduras sobre cada tramo).

| Sala | Que tiene | Se llega por |
| --- | --- | --- |
| Escalera de los condenados | Reja de la cripta en el muro norte del crucero, rellano, un solo tramo de unos 32 grados entre muros humedos y raices, antorcha arriba y abajo, charco al pie | Reja de la cripta (1500) desde el crucero |
| Galerias de los olvidados | Dos bloques de nichos (sellados, abiertos con huesos o rotos) rodeados de pasillos de 3,4 m que forman un ocho; ataudes, velas en mensulas, Vector | Abiertas desde el rellano; dos entradas de zombis |
| Panteon real | Tres por tres tramos sobre cuatro pilares; cuatro reyes yacentes distintos (rey con espada, reina con libro, rey con cetro y orbe, y el sepulcro este abierto y vacio junto a una grieta por la que se oye viento); escudos con los palos de la vieja corona, corona de velas sobre el tramo central, el sepulcro oeste a oscuras; M4A1 | Reja del panteon (1500); dos entradas de zombis |
| Relicario | Altar ritual con tres huecos vacios unidos por un canal, relicarios en hornacinas, atril con libro podrido, repisa de velas | Reja del relicario (1250) desde el panteon; una entrada |
| Santuario del ultimo aliento | Camara circular con cupula nervada, pedestal con copa vacia, anillo de runas, roca caida y motas palidas girando; unica luz fria | Reja del santuario (1500) desde el relicario, o el atajo del osario (2500) desde las galerias; una grieta de zombis |

- El circuito galerias, panteon, relicario, santuario y osario evita
  callejones sin salida en rondas altas; los sepulcros dejan paso por todos
  sus lados y el tramo central del panteon queda libre para girar la horda.
- El color turquesa palido se reserva al futuro Arco del Viento: la grieta
  del panteon, las runas y el pedestal del santuario y los huecos del altar.
- Abajo no hay luna; el relleno baja a la mitad y vira a un gris azulado
  desaturado, y la niebla se cierra y se enfria (`CATACOMB_MOOD`), de modo
  que las velas y antorchas calidas contrastan con un frio tenue sin que la
  cripta quede negra: las siluetas se leen en los rincones. Un reflejo frio
  de la noche baja por la escalera, una antorcha marca la reja del relicario y
  hay velas votivas junto a los dos sepulcros iluminados. Cada llama de abajo
  lleva un halo aditivo tenue (`CATACOMB_FLAME_HALO`) que sustituye a una luz
  real por vela, y el suelo se oscurece bajo sepulcros y pilares como sombra de
  contacto horneada. Los sonidos de abajo (`CATACOMB_AMBIENT_EVENTS`)
  sustituyen a los de la nave mientras se esta bajo tierra.
- Los muertos que se levantan en la planta -1 son restos de siglos
  (`CRYPT_ZOMBIE_LOOK`): hueso amarillento y gris con mugre y jirones de
  tejido seco, cuencas vacias, miembros consumidos hasta el hueso, y sudario,
  cota oxidada o capa noble raidas. Conservan ese aspecto aunque persigan al
  jugador escaleras arriba; los de la catedral nunca lo llevan. Sus ojos solo
  guardan un destello frio apenas visible, sin brillo de fantasia.
- Algunos salen de los sepulcros (`CRYPT_TOMB_EMERGENCES`), nunca de todos:
  del de la reina, el oscuro que golpea por dentro, cuya losa con su efigie
  se arrastra de lado la primera vez y queda entreabierta hasta reiniciar, y
  del sepulcro vacio, ya abierto. Salen por el lado que da a la sala, con
  polvo de piedra y un roce grave, sin brillos ni efectos de fantasia, y solo
  despues de abrir el panteon (`CRYPT_TOMB_EMERGENCE`).

### Arco del Viento: solo preparado

El arma, su mision, sus piezas recogibles, el montaje y la recompensa no
existen. Solo hay ids estables (`WIND_BOW_COMPONENTS`: `oathwood`,
`whisperstring`, `tempestCore`), sus lugares reservados
(`WIND_BOW_COMPONENT_SITES`: el sepulcro vacio, el confesionario de la nave
lateral este y el pedestal del santuario) y el altar de montaje con sus tres
huecos (`WIND_BOW_ALTAR`, `windBowSocket`). Todo esta en
`DieKathedraleCatacombsConfig.ts`; la logica futura debe leerlo de ahi.

## Entrada cinematografica

La intro dura 16 s y presenta la escala del templo en un recorrido continuo:
desde el exterior sobre la plaza se aproxima a la portada, baja para entrar
por el postigo y se eleva sobre las rejas hacia la boveda y el gran roseton.
La retirada y el descenso terminan en los ojos del jugador, en el nartex.
La tarjeta propia usa oro envejecido y luz fria, deja libre el centro de la
escena y se retira antes de entregar el control. Viento, madera e hierro
procedurales marcan el exterior, el umbral y la nave; no son campanas ni organo.

El recorrido y sus sonidos se declaran en
[`DIE_KATHEDRALE_INTRO` y `DIE_KATHEDRALE_INTRO_CUES`](../src/zombies/maps/DieKathedraleConfig.ts).
La [arena](../src/zombies/maps/DieKathedraleArena.ts) retira solo la imagen
del postigo durante el plano y la restaura al terminar, saltar o reiniciar:
la intro no compra la plaza ni abre zonas. Usa el mismo flujo de entrada,
salto y pausa de Station 33; consulta [sistemas](GAME_SYSTEMS.md#mapas-e-interacciones).

## Directrices tecnicas

- Un muro mas largo que 20 m no cuenta como obstaculo para la horda: se
  construyen por tramos (`DieKathedraleWalls.addStoneWall`, con `breaks`).
- Las divisiones de la nave son datos (`DIE_KATHEDRALE_SCREENS`, `DIE_KATHEDRALE_CHAPELS`) y
  las dibuja `NaveDivisions`: cada tramo deja un solido bajo (jugador, horda y
  disparos rasos) y los barrotes de encima solo se dibujan. No anadas muros
  de altura completa dentro de la nave. Una reja de pago es un `PointDoor`
  sobre la linea de su reja; debe dar a suelo despejado por ambos lados (los
  bloques de bancos dejan menos de un metro junto a los pilares).
- La colision del jugador es por cajas alineadas a los ejes. Los pilares tienen
  un solido octogonal invisible para las balas y su caja envolvente para el
  jugador y la horda; el resto del mobiliario usa `addSolidProxy`.
- El interior, la plaza, el exterior, el campanario y la cubierta usan
  lotes estáticos separados por sector y material para que el renderizador
  descarte los que quedan fuera de la vista.
- La visibilidad se refuerza con islas calidas de corto alcance en los
  candelabros, sin subir el relleno ni la luna. Las islas de velas conservan
  separacion; los acentos frios de las vidrieras pueden coincidir con ellas.
- Ninguna luz proyecta sombras. Las luces reales son un grupo fijo del tamaño
  del presupuesto de calidad que sigue a la camara durante la intro y al
  jugador durante la partida entre los puntos de luz
  (`DieKathedraleLighting`); solo los puntos encendidos participan en esa
  seleccion. Las llamas de los candelabros comparten una malla de instancias
  (`ColumnCandleFlames`); su encendido lo decide `CandleIgnition`, sin Three.js.
  A distancia conservan su brillo de material aunque la luz real se reutilice.
- El paisaje de la plaza no lleva niebla ni luz y debe quedar dentro del plano
  lejano de la camara.
- Las catacumbas son la planta -1, a 6 m bajo la nave, fuera de la huella de
  la catedral salvo la escalera. Sus datos viven en
  `DieKathedraleCatacombsConfig.ts`, que solo importa tipos de
  `DieKathedraleConfig.ts` (este lo importa a el); sus builders, en
  `dieKathedrale/catacombs/`. Entradas, puertas y wall buys llevan `floor`, y
  los muros, sus propios cortes (`CATACOMB_WALL_CUTS`).
- `undergroundPresence` mantiene visible lo necesario desde la escalera
  de las catacumbas, que puede verse desde ambas plantas. El exterior y
  el campanario tienen sus propios grupos de visibilidad. Todos los
  sectores comparten el presupuesto de luces reales.
- El muro redondo del santuario solo se dibuja: lo que para a jugador y horda
  son su cuadrado oculto y una escalera de cajas inscritas
  (`SANCTUARY_INSCRIBED_STEPS`) cuyos huecos tapan los escombros.
- Las texturas y vidrieras del escenario se generan en codigo. La portada del
  menu usa una ilustracion raster original de la nave, con pilares, roseton y
  velas, y el mismo tratamiento dorado premium que Station 33; su fuente esta
  registrada en [ASSETS.md](../ASSETS.md). La musica reutiliza una pista
  existente y los sonidos ambientales, los `AmbientCueSound` procedurales
  compartidos.

## Pendiente

- Validacion visual y medicion de FPS en navegador, PC y Android; en
  especial, el encuadre, el ritmo y el sonido de la intro, que la oscuridad
  deje leer a los zombis y las rejas en combate, y
  que las once skins de la horda se distingan y no atraviesen la ropa. El
  baculo de la abadesa va plantado a su lado y el farol y el libro cuelgan del
  cinto: las animaciones del walker no dejan una mano libre para sostenerlos.
- Ampliación: revisar a mano las vistas y el ritmo del circuito exterior, la
  subida y la bajada del caracol con teclado y control táctil, la legibilidad
  de la salida del campanario y la presión de la horda en el patio y la
  terraza.
- Las skins de la horda son geometria low-poly con un atlas procedural de
  64 px por patron: la cota, los bordados y el encaje se leen a distancia de
  combate, pero no tienen el detalle del concept art. Las caras, las manos y
  los pies siguen siendo los del walker. Igualarlo exigiria texturas pintadas o
  modelos dedicados.
- Cada reja de pago cuesta unas 20 llamadas de dibujo hasta que se compra
  (`BuyableDoorVisual` compartido); si el movil lo acusa, fusionar sus piezas.
- La nave central no tiene entrada de zombis propia.
- Catacumbas: validacion visual y sonora, y FPS medidos en PC y Android (en
  especial el rellano, desde donde se dibujan ambos niveles). Que la
  oscuridad deje leer a los zombis y las rejas, que la grieta y el santuario
  no resulten demasiado brillantes y que la escalera se baje con comodidad.
- Reverberacion propia de la catedral y de las catacumbas: el audio no tiene
  aun reverb por mapa ni por planta, y el fondo sonoro de viento es el mismo
  arriba y abajo.
- Arco del Viento: arma, mision, piezas y montaje.
- Musica propia y sonidos ambientales de campanas y organo.
- Zonas previstas: claustro, Almudaina, Parc de la Mar y casco antiguo.
  También están pendientes la electricidad, la mejora de armas y un final
  propio.
- Cooperativo: el mapa no depende del modo, pero el protocolo solo negocia
  `COOP_ZOMBIE_MAP_ID`.
