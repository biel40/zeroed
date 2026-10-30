# Ambiente sonoro y transiciones de ronda

- Que: fondo procedural por mapa, eventos ambientales en Burned Mansion y dos
  mas en Station 33, cue de fin de ronda con descenso del ambiente durante el
  descanso, cupo de gemidos de zombi, disparos del compañero posicionales en
  cooperativo y suspension del contexto de efectos con la pagina oculta.
- Por que: el viento existia pero nadie lo arrancaba desde la llegada del
  cooperativo, la mansion no tenia vida sonora propia, el fin de ronda era mudo
  y en cooperativo los disparos del compañero no sonaban.
- Donde: `AmbientBed` (fondos), bus de ambiente y `playRemoteShot` en
  `AudioSystem`, `RoundCueGate` y `VoiceLimiter` (logica pura con tests),
  `MANSION_AMBIENT_EVENTS` con el `AmbientEventScheduler` compartido y
  `ArenaAmbience.ambientBed`. No cambia el protocolo de red: el cooperativo
  reutiliza `playerShoot`, `roundStart` y `roundEnd`.
- Decidido: no se reintroducen los gruñidos de ataque, muerte ni el golpe
  recibido que se retiraron en d1f4a9d. No hay atenuacion automatica del
  ambiente con cada disparo: el ambiente ya es tenue y se evita un bombeo
  audible del volumen. La suspension por visibilidad no toca la musica: sus pistas
  pausadas por el menu viven en `MusicManager.pauseOffsets` y reanudarlas desde
  aqui las haria sonar sobre la pausa.
