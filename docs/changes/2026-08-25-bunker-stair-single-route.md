# Acceso unidireccional a la escalera del bunker

**Que**: los dos pasillos que rodeaban la escalera en la planta superior se rellenan con volumenes macizos. Solo queda el canal central, abierto por el rellano superior para bajar y por el rellano inferior para salir al bunker.

**Por que**: era posible rodear la rampa, colocarse junto a sus costados y alcanzar su extremo inferior desde la planta equivocada. Esto exponia cambios bruscos de altura y estados de planta inconsistentes.

**Donde**: `src/zombies/maps/BurnedMansionArena.ts`, `tests/burnedMansion.test.ts`, `docs/PROJECT_STATE.md`, `docs/GAME_SYSTEMS.md`.

**Aprendido**: cerrar solo el borde inmediato de una rampa evita entradas laterales, pero no elimina una ruta que rodea el hueco. El volumen lateral debe ocupar todo el espacio entre el canal, los muros exteriores y ambos extremos de la pendiente.
