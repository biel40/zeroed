# Rediseño geométrico de Walker y Brutus

**Qué**: Walker sustituye el asset externo anterior por un GLB original
articulado low/mid-poly con anatomía humana, rostro completo, ropa por capas,
heridas y variaciones visibles por instancia. Brutus amplía su forma triangular
invertida con espalda, trapecios, dorsales, cuello, manos, piernas y rostro más
pesados y deteriorados.

**Por qué**: los ajustes anteriores deformaban el mismo walker y no producían
una diferencia suficiente en silueta o geometría. Brutus aún dependía de pocas
masas simples y no comunicaba con claridad su rol de mini-boss.

**Dónde**: `scripts/generate-walker-asset.mjs`,
`scripts/generate-brute-asset.mjs`, `public/assets/zombies/*.glb`,
`src/zombies/ZombieVisual.ts`, pruebas y catálogo de assets.

**Rendimiento**: se conservan dos GLB locales compartidos, pools existentes,
materiales estándar, mixers y límites de población. Walker consolida 45 piezas
en un solo skinned mesh con diez grupos de material. No se añaden texturas,
luces por enemigo, shaders, IA ni cálculos geométricos por frame.
