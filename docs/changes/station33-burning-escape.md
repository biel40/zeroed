# Huida de Station 33: incendio y catedral

- Que: el final de la evacuacion añade un plano montado en la cabina del
  camion que mira atras mientras la horda persigue y la estacion arde
  (`PROTOCOL33_BLAZE`, `EscapeBlaze` + `StationBlaze`), y la grua final sube
  hasta una catedral en las montañas (`PROTOCOL33_HIGHLANDS`,
  `HighlandCathedral`). Sustituye al plano de los pilotos en la niebla.
- Por que: la huida pedia mostrar la estacion arrasada y un destino en el
  horizonte, no solo el camion perdiendose en la niebla.
- Donde: `EVACUATION_ENDING_TIMELINE` gana el beat `blaze` y se alarga
  (titulo 12.8 s, creditos 18.8 s); los tiempos de `style.css` estan escritos
  a mano y se movieron con el.
- Aprendido: la niebla de la superficie (exp2 0.026) borra todo a ~80 m, asi
  que fuego, cordillera y catedral usan materiales sin niebla con tonos
  nocturnos elegidos a mano; la catedral se alza sobre una cumbre por encima
  de los bloques de la ciudad, que si se nublan y la taparian desde la grua.
  El fuego no añade luces reales (presupuesto fijo): tiñe el foco de la
  caseta, que su circuito sigue gobernando en intensidad. El bloque de viviendas que cruzaba la carretera
  se partio en dos para que el camion (y la camara montada) pasen por el
  hueco. Las teclas del plano montado se calculan con `escapeDrivePose` en
  tramo de crucero para que el Catmull-Rom siga al camion.
