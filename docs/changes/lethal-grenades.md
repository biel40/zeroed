# Granada letal F-1 y zombis tullidos

- Que: primera granada letal del juego, la F-1 sovietica, con explosion propia
  y zombis que pierden las piernas y se arrastran, al estilo de CoD Zombies.
- Decision (usuario, 2026-11-07): una sola granada, de estetica sovietica; la
  run empieza con dos, cada ronda suma dos hasta cuatro y una pared del mapa
  rellena la bolsa (Station 33: vestibulo, muro este, 250).
- Por que asi: el lanzamiento reutiliza el contrato del cuchillo
  (`MeleeArmDriver`) y su cadena de brazo (`ArmChain`, extraida de `Knife`); la
  explosion reutiliza `GibWalls` para rebotar y `BillboardLayer` (extraida de
  `FlameParticles`) para el fuego; el arrastre usa el clip `ZombieCrawl` que el
  GLB ya traia para la aparicion, en vez de hornear uno nuevo. Sin luces
  reales: cambiar el numero de luces recompilaria los materiales en mitad de
  la partida.
- Audio personalizado: basta con dejar `public/assets/audio/f1_explosion.mp3`;
  sin el archivo suena la explosion procedural.
- Ampliacion (usuario, 2026-11-08): cocinado manteniendo el boton, dano
  fuerte al Capitan URSS y uso en cooperativo. La espoleta pasa a contar
  desde la anilla (3,6 s) para que una pulsacion siga volando unos 3 s; en
  cooperativo el anfitrion resuelve las explosiones y cada cliente simula el
  vuelo con los mismos datos de lanzamiento, en vez de replicar posiciones.
- Pendiente: validacion visual, sonora y con latencia en el juego (poses del
  lanzamiento y del cocinado, explosion, velocidad del arrastre
  `crawl.referenceSpeed`, posicion de la pared, coincidencia del vuelo entre
  clientes).
