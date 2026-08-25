# Ampliacion de las salas M4A1 y bunker

**Que**: el ala este crece dos metros: la sala M4A1 gana un metro de anchura y la sala de acceso al bunker gana otro. La fachada, suelo, techo, bunker inferior, limites, compuerta, ventana, spawns y compras de pared se desplazan de forma coherente. La escalera se centra en la nueva sala y su canal se ensancha medio metro sin recuperar pasillos laterales.

**Por que**: ambas salas dejaban poco margen para jugador y zombies alrededor de sus accesos. Ampliar solo los meshes habria separado la presentacion de las colisiones y la navegacion.

**Donde**: `src/zombies/maps/BurnedMansionConfig.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `tests/burnedMansion.test.ts`, `tests/bunkerSecret.test.ts`.

**Aprendido**: la huella este conecta dos plantas y varios sistemas. Fachada, bounds, apertura del forjado, rampa, triggers, puerta, ventana, rutas exteriores y objetos anclados a muros deben compartir las mismas coordenadas de topologia.
