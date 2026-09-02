# Anatomía zombie, Brute pesado y velocidad inicial

**Qué**: los walkers ajustan proporciones y pequeñas asimetrías mediante su
esqueleto existente, amplían su paleta enfermiza y corrigen el material PBR
demasiado metálico/emisivo. Brute ensancha torso, espalda, cuello y brazos,
añade deterioro visible y rehace sus clips de marcha y golpe para expresar
peso sin root motion. Las rondas 1-5 multiplican la velocidad ya calculada por
0.75, 0.80, 0.85, 0.90 y 0.95 respectivamente.

**Por qué**: mejorar silueta, lectura bajo iluminación nocturna y variedad sin
assets pesados, shaders, luces por enemigo ni cambios en IA o combate, y dar al
jugador una introducción más gradual antes del ritmo normal.

**Dónde**: `ZombieVisual.ts`, `ZombieConfig.ts`, `ZombieManager.ts`,
`scripts/generate-brute-asset.mjs`, `zombie_brute.glb` y pruebas zombie.

**Aprendido**: modificar huesos no animados en escala mantiene geometría y
clips compartidos, mientras las hitboxes continúan siguiendo sus anchors. El
movimiento sigue siendo autoritativo en `ZombieManager`; los clips de Brute no
desplazan el root de gameplay y desde ronda 6 el factor adicional es exactamente
1.
