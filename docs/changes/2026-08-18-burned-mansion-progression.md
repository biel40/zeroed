# Progresion de armas en Burned Mansion

**Que**: el spawn ofrece la M1911, la segunda sala conserva la AK-47 y una tercera sala pagada incorpora la M4A1 antes del acceso al Bunker.

**Por que**: la M4A1 debe conservar su potencia, pero quedar disponible mas tarde en la progresion del mapa.

**Donde**: `src/zombies/maps/BurnedMansionConfig.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `tests/burnedMansion.test.ts`.

**Aprendido**: las puertas activan zonas por ID y la secuencia depende de sus colliders fisicos. La tercera sala reutiliza el espacio este existente, suma una entrada de 1250 puntos y una ventana con spawn propio. La M4A1 queda en una pared alejada del tabique de entrada porque los Wall Buys no comprueban oclusion. La puerta secreta y su coste de 9999 puntos no cambian.
