# Station 33: direccion de arte y enfoque del mapa

Guia para retomar Station 33 sin perder su identidad. Describe la intencion
(que se quiere transmitir y por que); las medidas, coordenadas y tablas viven en
`src/zombies/maps/Station33Config.ts` y en los builders de
`src/zombies/maps/station33/`. Si el codigo y esta guia discrepan, manda el
codigo: actualiza la guia.

## Que es

- Estacion de metro sovietica profunda, abandonada tras una evacuacion que
  fracaso. La salida a la superficie se hundio y nadie volvio: el lema del mapa
  es "Nadie ha vuelto de la estacion".
- Mapa premium y solo individual. Mientras no haya pagos, premium solo cambia la
  presentacion (tarjeta dorada, insignia, intro) y la beta cerrada lo juega
  completo. Debe notarse superior a Burned Mansion desde el primer segundo, sin
  degradar el modo individual ni introducir dependencias del modo con el mapa.
- Se construye por fases. La Fase 1, el vestibulo, es una partida completa:
  cuatro entradas con chapas de acero, la AK-47 en pared y la escalera mecanica
  sellada. La Fase 2 abre la consigna tras la primera puerta de pago. Cada fase
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
  de la consigna esta pendiente.
- La taquilla del anillo, bajo la placa "БЮРО НАХОДОК" (objetos perdidos), es
  el foco al final del eje del pasillo: abierta, con un cojin de terciopelo y
  la alianza brillando con su propio esmalte. Tras la compra queda vacia y
  apagada; si el anillo se gasta, el cojin vacio vuelve a latir para pedir la
  recarga, hasta que la tercera compra de la run la deja vacia para siempre.
  Ese brillo es de material emisivo, nunca una luz.
- Alrededor de la taquilla suena en bucle una musica de maquina, como el jingle
  de las bebidas de CoD Zombies: se oye a pleno a su lado y se apaga a unos
  10 m, nunca desde el vestibulo. Hoy es una cajita de musica procedural
  provisional; `public/assets/audio/ring_machine_jingle.mp3` la sustituye en
  cuanto exista (pista libre de derechos, en bucle limpio).

## Anillos

- Los anillos son las perks de Zeroed: alianzas que los evacuados dejaron en
  las taquillas. Uno por dedo de la mano derecha, cada uno en un dedo fijo,
  visibles en primera persona; el HUD solo apoya.
- Su brillo es un acento frio (turquesa para Resurreccion); el dorado sigue
  reservado a lo premium. Un anillo gastado se queda en el dedo, sin brillo.
- Catalogo previsto (solo existe Resurreccion): anular, Resurreccion (salva una
  muerte); corazon, Vitalidad (vida maxima); indice, Doble impacto (dano y
  cadencia); menique, Cadencia (recarga); pulgar, un anillo de utilidad (por
  ejemplo, tercera arma). Las fases siguientes anadiran el interruptor de la
  subestacion (maquinas que exigen energia) y el Pack-a-Punch.

## Paleta y materiales

- Fondo y niebla casi negros con matiz verde; hemisferica tenue verde gris.
- Luces: blanco verdoso fluorescente, ambar calido en apliques, rojo de
  emergencia. El dorado queda reservado a lo premium (tarjeta, intro, insignia)
  y a los numeros del arte de menu; no se usa como luz del escenario.
- Superficies: marmol claro con vetas, granito gris y rojo gastado por el paso,
  yeso de boveda con cercos de humedad, hormigon oscuro en los pasadizos, acero
  verde militar desconchado hasta el oxido, bronce en marcos y barandillas.
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
- La musica de partida es provisional (la del juego base); el mapa merece una
  pista propia mas adelante.

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
  de la otra completan); el resto brilla con materiales emisivos que siguen a
  su circuito. Un numero fijo de luces visibles evita recompilar shaders.
- La geometria estatica se agrupa en un unico batch; cada mueble solido tiene
  un proxy AABB simple que para balas, zombies y jugador.
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
- Valida con `npm run typecheck` y `npm test` (`tests/station33.test.ts` y
  `tests/mapIntro.test.ts` cubren disposicion, puertas, rutas, luces,
  ambiente e intro).
