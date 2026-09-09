# Acceso al bunker y wall-buy M4A1

**Qué**: la escalera del bunker se desplaza hacia el fondo del ala este y todas sus piezas asociadas comparten cotas autoritativas: peldaños, rellenos laterales, muro trasero, rampa, huecos de suelo/techo y triggers de planta. Los zombies usan un punto de aproximación alineado con la puerta antes de girar hacia la rampa. El wall-buy M4A1 recibe una silueta dedicada de carabina con perfil largo y bajo, culata y asa perforadas, receiver fino, cargador STANAG, guardamanos segmentado y mira delantera triangular. También se elimina el foco rojo oscuro colocado frente a esa pared.

**Por qué**: el conjunto anterior comenzaba casi pegado al vano de la puerta y obligaba a jugadores y zombies a girar dentro del marco. La navegación podía considerar libre una diagonal que la colisión física rechazaba, provocando oscilaciones. La silueta genérica de arma larga no reproducía los rasgos visuales de una M4A1 y el foco rojo parecía una mancha sin función.

**Dónde**: `BurnedMansionConfig.ts`, `BurnedMansionArena.ts`, `PlayerController.ts`, `ZombieManager.ts`, `WallBuyView.ts`, `burnedMansion.test.ts` y `m4a1View.test.ts`.

**Aprendido**: las transiciones desplazadas respecto a una puerta necesitan un waypoint de aproximación explícito. La decisión de activar A* debe coincidir con la colisión física de radio corporal, no depender solo de la línea de visión discreta de la rejilla.