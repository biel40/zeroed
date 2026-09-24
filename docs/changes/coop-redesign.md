# Rediseño del cooperativo

- Que: `CoopZombiesMode` se divide en `CoopWorld` (mapa compartido),
  `CoopHostMode` (autoridad unica) y `CoopGuestMode` (replica). Protocolo
  nuevo y validado, `ZombieReplica` interpolada, `RemotePlayer` con pipeline
  GLB, pausa local real y `Game.dispose()` sin recarga.
- Por que: un cliente podia quedar atascado en PAUSED, los zombis del invitado
  eran un espejo roto (sin subida, caida ni golpe; ids de pool reutilizados) y
  volver al menu recargaba la pagina.
- Donde: `src/modes/coop/`, `src/network/`, `src/zombies/ZombieReplica.ts`,
  `src/rendering/RemotePlayer*.ts`, `Game.ts`, `HUD.ts`, `main.ts`, relays.
- Aprendido: `paused` mezclaba menu local y parada de simulacion; en red el
  input del jugador local dependia de estado remoto (`remotePlayer.visible`,
  `snapshot`), y `PlayerController` sin input tampoco mira: el cliente volvia
  de RESUME congelado. Un lock repetido sin peticion forzaba un unlock y
  reabria la pausa. El anfitrion rechazaba para siempre poses a mas de 4 m o
  fuera de y 1.2-3.5 (bunker). Los ids de zombi deben ser por spawn, no por
  hueco del pool, pero los carriles de persecucion siguen usando el id del
  hueco para no alterar el individual. Los handlers del HUD deben asignarse
  (`onclick`), no acumularse, para crear varios `Game` en la misma pagina.
