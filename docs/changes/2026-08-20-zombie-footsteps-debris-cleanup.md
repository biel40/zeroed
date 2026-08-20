# Pasos 3D de zombies y limpieza de debris poligonal

**Qué**: (1) eliminados los 5 dodecaedros decorativos sueltos de Burned Mansion
(geometría, material `debris` y test que los cubría); (2) pasos posicionales de
zombie con `THREE.PositionalAudio`: pool de 8 fuentes reasignadas a los zombies
vivos más cercanos cada 0.25 s, cadencia derivada de la velocidad medida real y
buffer único compartido con fallback sintetizado.

**Por qué**: las piedras leían como objetos fuera de lugar y el audio plano no
permitía localizar la horda; se pedía oído direccional sin coste en móvil.

**Dónde**:
- `src/zombies/maps/BurnedMansionArena.ts` / `BurnedMansionMaterials.ts` —
  spawn de rubble y material `debris` eliminados; el rubble era solo visual
  (nunca estuvo en `structureMeshes` ni en colliders).
- `src/zombies/ZombieFootsteps.ts` — sistema nuevo: `pickAudibleZombies` y
  `stepIntervalForSpeed` son puras (tests en `tests/zombieFootsteps.test.ts`).
- `src/audio/AudioSystem.ts` — getter `rawContext`: el `AudioListener` COMPARTE
  el contexto vía `THREE.AudioContext.setContext()` (un solo contexto por
  página; los móviles limitan AudioContexts).
- `src/zombies/ZombieManager.ts` — getter `actives` (vista read-only del pool).
- `src/modes/ZombiesMode.ts` — construcción, `update` tras `zombies.update` y
  `footsteps.reset()` en `restart()`.
- `ASSETS.md` — documentado el asset opcional `assets/audio/zombies/footsteps.mp3`.

**Aprendido**:
- `THREE.Audio.play()` avisa y NO re-dispara si `isPlaying`: hay que hacer
  `stop()` antes de cada paso.
- La puerta de movimiento usa velocidad MEDIDA (posición real entre frames),
  no la configurada: un zombie empujando contra una pared en estado `walk` no
  pisa. Solo `state === 'walk'` + velocidad > 0.2 m/s reproduce pasos.
- Panner: `inverse`, refDistance 2, maxDistance 28, rolloff 1; el radio de
  asignación (22 m) queda por debajo para que los lejanos ni siquiera consuman
  fuente. Valores iniciales pendientes de ajuste fino en juego.
- Cambiar de mapa recarga la página (`window.location.assign`), así que no hace
  falta `dispose()`: basta `reset()` en el reinicio de run.
