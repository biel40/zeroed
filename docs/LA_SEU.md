# Die Kathedrale: direccion de arte y enfoque del mapa

Guia para retomar Die Kathedrale (La Seu de Palma) sin perder su identidad.
Describe la intencion; las medidas, coordenadas y tablas viven en
`src/zombies/maps/LaSeuConfig.ts` y en
los builders de `src/zombies/maps/laSeu/`. Si el codigo y esta guia discrepan,
manda el codigo: actualiza la guia.

## Que es

- La catedral gotica de Palma de Mallorca, de noche y tomada por los muertos.
  Una interpretacion reconocible, no una reproduccion a escala: las naves miden
  aproximadamente la mitad que las reales y se conservan las proporciones que
  la hacen inconfundible.
- Mapa individual y premium, visible en el menu como Die Kathedrale. Conserva
  el id interno `la-seu` y las rutas `LaSeu`; producto y acceso se declaran en
  [el registro de mapas](../src/config/zombieMaps.ts). Comparte el acceso de
  [beta cerrada](../public/beta/README.md) con Station 33.
- Se construye por fases, como Station 33. Cada fase debe ser una partida
  completa y nunca abrir puertas hacia el vacio. El plan de ejes esta al
  principio de `LaSeuConfig.ts`: el frente principal sobre z = 0, la nave hacia
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
   un haz y un charco frio. El resto son puntos contados y separados: un
   lampadario, el anillo de un pilar, el altar de una capilla, las velas del
   altar mayor y la lampara roja del sagrario. Entre isla e isla, negro. Cada
   arma de pared y el punto de inicio tienen una isla al alcance.
4. **Terror gotico contenido.** Algo terrible paso aqui y nadie lo explica:
   los muertos bajo sabanas en una capilla, bancos arrastrados y rotos,
   sangre que cruza cada reja alejandose de las puertas, telaranas, niebla
   baja en los rincones y ruidos raros y espaciados (hierro, viento, madera,
   golpes tras la sacristia). Nada sobrenatural, ningun susto de guion y
   poco atrezo: no es una mazmorra de fantasia.
5. **Palma alrededor.** La plaza es un mirador: la bahia bajo la luna, la
   muralla del mar, la silueta almenada de la Almudaina y Bellver al fondo.

## Fase 1 (construida)

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
`LaSeuConfig.ts`.
## Directrices tecnicas

- Un muro mas largo que 20 m no cuenta como obstaculo para la horda: se
  construyen por tramos (`LaSeuWalls.addStoneWall`, con `breaks`).
- Las divisiones de la nave son datos (`LA_SEU_SCREENS`, `LA_SEU_CHAPELS`) y
  las dibuja `NaveDivisions`: cada tramo deja un solido bajo (jugador, horda y
  disparos rasos) y los barrotes de encima solo se dibujan. No anadas muros
  de altura completa dentro de la nave. Una reja de pago es un `PointDoor`
  sobre la linea de su reja; debe dar a suelo despejado por ambos lados (los
  bloques de bancos dejan menos de un metro junto a los pilares).
- La colision del jugador es por cajas alineadas a los ejes. Los pilares tienen
  un solido octogonal invisible para las balas y su caja envolvente para el
  jugador y la horda; el resto del mobiliario usa `addSolidProxy`.
- Interior y plaza se fusionan en lotes separados (un mesh por material y
  zona) para que el renderizador descarte la zona que queda fuera de la vista.
- Una luz nueva debe ser una isla: lejos de las demas y de corto alcance. Si
  hace falta ver mas, mueve una isla; no subas el relleno ni la luna.
- Ninguna luz proyecta sombras. Las luces reales son un grupo fijo del tamaño
  del presupuesto de calidad que sigue al jugador entre los puntos de luz
  (`LaSeuLighting`); todo lo demas brilla por materiales sin iluminar.
- El paisaje de la plaza no lleva niebla ni luz y debe quedar dentro del plano
  lejano de la camara.
- Las texturas y vidrieras del escenario se generan en codigo. La portada del
  menu usa una ilustracion raster original de la nave, con pilares, roseton y
  velas, y el mismo tratamiento dorado premium que Station 33; su fuente esta
  registrada en [ASSETS.md](../ASSETS.md). La musica reutiliza una pista
  existente y los sonidos ambientales, los `AmbientCueSound` procedurales
  compartidos.

## Pendiente

- Validacion visual y medicion de FPS en navegador, PC y Android; en
  especial, que la oscuridad deje leer a los zombis y las rejas en combate.
- Cada reja de pago cuesta unas 20 llamadas de dibujo hasta que se compra
  (`BuyableDoorVisual` compartido); si el movil lo acusa, fusionar sus piezas.
- La nave central no tiene entrada de zombis propia.
- Reverberacion propia de la catedral: el audio no tiene aun reverb por mapa.
- Musica propia, intro y sonidos ambientales (campanas, organo).
- Zonas siguientes: claustro, campanario, Almudaina,
  Parc de la Mar y casco antiguo. Anillos, electricidad, mejora de armas y un
  final propio.
- Cooperativo: el mapa no depende del modo, pero el protocolo solo negocia
  `COOP_ZOMBIE_MAP_ID`.
