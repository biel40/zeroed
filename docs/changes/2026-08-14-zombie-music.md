# Música de Zombies: intro de ronda y loop de fondo

**Qué**: añadí un servicio pequeño y reutilizable de música para Zombies que carga dos archivos `.mp3` desde `public/assets/audio/` y los gestiona sin duplicar instancias.

**Por qué**: el modo Zombies ya tenía una capa de audio procedural y un ciclo de rondas bien definido, así que la música debía integrarse en ese mismo flujo sin romper el sistema existente ni crear sonidos superpuestos al pausar, reiniciar o cambiar de ronda.

**Dónde**: `src/audio/MusicManager.ts`, `src/audio/AudioSystem.ts`, `src/core/Game.ts`, `src/modes/ZombiesMode.ts`.

**Aprendido**: el patrón correcto es mantener una única `HTMLAudioElement` por pista (`round start` y `background loop`), y pausar/reanudar la reproducción sobre esa misma instancia. El navegador bloquea la reproducción automática sin gesto del usuario, así que la música se inicializa desde el mismo flujo de `start()` del juego y se reanuda con el click/ESC del menú. Las rutas exactas quedan claras en `ZOMBIES_MUSIC_PATHS` para sustituir después los archivos por música propia:

- `assets/audio/zombies_round_start.mp3`
- `assets/audio/zombies_background_loop.mp3`
