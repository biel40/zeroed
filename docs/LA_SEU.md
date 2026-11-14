# La Seu: direccion de arte y enfoque del mapa

Guia para retomar La Seu sin perder su identidad. Describe la intencion; las
medidas, coordenadas y tablas viven en `src/zombies/maps/LaSeuConfig.ts` y en
los builders de `src/zombies/maps/laSeu/`. Si el codigo y esta guia discrepan,
manda el codigo: actualiza la guia.

## Que es

- La catedral gotica de Palma de Mallorca, de noche y tomada por los muertos.
  Una interpretacion reconocible, no una reproduccion a escala: las naves miden
  aproximadamente la mitad que las reales y se conservan las proporciones que
  la hacen inconfundible.
- Mapa individual e incluido (sin producto). Se desarrolla en la rama
  `feature/map-la-seu`; decide su visibilidad en el menu antes de integrarla.
- Se construye por fases, como Station 33. Cada fase debe ser una partida
  completa y nunca abrir puertas hacia el vacio. El plan de ejes esta al
  principio de `LaSeuConfig.ts`: el frente principal sobre z = 0, la nave hacia
  el norte (el este liturgico) y la plaza hacia el sur, sobre el mar.

## Pilares de ambientacion

1. **Escala gotica.** Lo primero que debe leerse es la altura: pilares
   octogonales muy esbeltos, boveda de cruceria de tres naves y la nave
   central muy por encima de las laterales. La niebla es fina a proposito
   para que la boveda se vea desde el suelo y el fondo de la nave se pierda.
2. **Piedra dorada de Santanyi, de noche.** Sillares calidos apagados por la
   penumbra azul. Nada de marmol frio (eso es Station 33) ni de madera
   quemada (eso es la mansion).
3. **La luz es el vidrio y la cera.** Rosetones y ventanales autoiluminados,
   charcos de color sobre el suelo, haces de luna por los ventanales del este
   y velas: los anillos de forja de los pilares, los lampadarios y el altar.
   El "ocho" que el roseton mayor dibuja bajo el del frente es un guiño a la
   fiesta de la luz de Palma.
4. **Un lugar que parece seguro.** Arquitectura serena y simetrica contra
   rastros de una ultima resistencia: bancos volcados en barricada, tramos
   despejados, sangre que sube por la nave central hasta el altar.
5. **Palma alrededor.** La plaza es un mirador: la bahia bajo la luna, la
   muralla del mar, la silueta almenada de la Almudaina y Bellver al fondo.

## Fase 1 (construida)

- **Nave**: siete tramos, dos filas de seis pilares, bancos en la nave
  central con un pasillo transversal en cada linea de pilares, naves
  laterales como rutas alternativas, pila bautismal, confesionario y
  lampadarios. Cinco entradas de zombis: dos puertas y dos ventanas de capilla
  alternadas en los muros laterales y la puerta de la sacristia junto al altar.
  M14 junto a las puertas mayores.
- **Presbiterio** tras el arco, bajo el roseton mayor: altar sobre su tarima,
  baldaquino heptagonal colgado, catedra y silleria del coro. AK-47 en pared.
- **Plaza de entrada**, tras el postigo de pago de las puertas mayores: frente
  principal con roseton, contrafuertes, torrecillas y hastial; dos puertas de
  zombis en los muros laterales, M60 en pared y la Mystery Box.

## Directrices tecnicas

- Un muro mas largo que 20 m no cuenta como obstaculo para la horda: se
  construyen por tramos (`LaSeuWalls.addStoneWall`, con `breaks`).
- La colision del jugador es por cajas alineadas a los ejes. Los pilares tienen
  un solido octogonal invisible para las balas y su caja envolvente para el
  jugador y la horda; el resto del mobiliario usa `addSolidProxy`.
- Interior y plaza se fusionan en lotes separados (un mesh por material y
  zona) para que el renderizador descarte la zona que queda fuera de la vista.
- Ninguna luz proyecta sombras. Las luces reales son un grupo fijo del tamaño
  del presupuesto de calidad que sigue al jugador entre los puntos de luz
  (`LaSeuLighting`); todo lo demas brilla por materiales sin iluminar.
- El paisaje de la plaza no lleva niebla ni luz y debe quedar dentro del plano
  lejano de la camara.
- Sin assets externos: texturas, vidrieras y tarjeta del menu se generan en
  codigo. La musica y el ambiente reutilizan pistas existentes.

## Pendiente

- Validacion visual y medicion de FPS en navegador, PC y Android.
- Tarjeta de menu pintada, musica propia, intro y sonidos ambientales
  (campanas, organo, viento en la plaza).
- Zonas siguientes: capillas laterales, claustro, campanario, Almudaina,
  Parc de la Mar y casco antiguo. Anillos, electricidad, mejora de armas y un
  final propio.
- Cooperativo: el mapa no depende del modo, pero el protocolo solo negocia
  `COOP_ZOMBIE_MAP_ID`.
