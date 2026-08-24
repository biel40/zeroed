# Asset Brute y catálogo extensible de zombies

**Qué**: Brute deja de ser un walker escalado con un abdomen superpuesto. Usa
`zombie_brute.glb`, un asset original con silueta, jerarquía, materiales y cinco
clips propios. Gameplay, modelo, tratamiento material, spawn y reserva visual
son contratos separados.

**Por qué**: el diseño anterior se parecía demasiado al zombie normal y la
arquitectura ligaba todas las variantes al walker, dificultando criaturas
realmente diferentes.

**Dónde**: `public/assets/zombies/zombie_brute.glb`,
`scripts/generate-brute-asset.mjs`, `ZombieConfig.ts`, `ZombieVisual.ts`,
`ZombiePool.ts`, `ZombieManager.ts`, `AssetManager.ts` y pruebas zombie.

**Aprendido**: un pool por capacidad física no debe convertirse en varios
límites de población. Se precargan 24 walkers y 2 Brutes, pero `ZombiePool`
mantiene 24 activos globales y selecciona el modelo requerido. Los cadáveres
siguen ocupando ambos límites hasta reciclarse. Normal y Shiny demuestran que
varios tipos pueden compartir modelo; Brute demuestra la ruta de asset propio.
Las rejillas A* se construyen por cada radio corporal configurado y los anchors
de hitbox pertenecen al contrato de cada modelo, evitando asumir anatomía walker.
