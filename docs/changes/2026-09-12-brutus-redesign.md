# Rediseño humanoide y golpe letal de Brutus

**Qué**: Brutus reemplaza por completo su anterior cuerpo pesado por un GLB
original humanoide de 2.30 m, demacrado y vestido como un infectado. Tiene
extremidades largas, chaqueta desgarrada, caja torácica expuesta, mandíbula rota,
rostro asimétrico y cinco animaciones propias. Su ataque emite un rugido grave
exclusivo y cualquier impacto confirmado mata a un jugador con la vida completa.

**Por qué**: el abdomen voluminoso, joroba, placa dorsal, puños gigantes y piernas
cortas no lo relacionaban con los walkers ni conseguían el tono de terror buscado.

**Dónde**: `scripts/generate-brute-asset.mjs`,
`public/assets/zombies/zombie_brute.glb`, `src/zombies/ZombieVisual.ts`,
`src/zombies/ZombieConfig.ts`, `src/zombies/ZombieManager.ts`,
`src/audio/AudioSystem.ts` y pruebas zombie/audio.

**Aprendido**: escala visual, hitbox y radio de navegación son contratos separados.
El modelo y las hitboxes pueden crecer verticalmente sin ensanchar el radio físico,
que debe seguir siendo compatible con las puertas y escaleras de Burned Mansion.
El rugido se dispara al comprometer el ataque, no al impacto, para conservar una
señal justa antes del daño letal y la ventana de esquiva existente.
