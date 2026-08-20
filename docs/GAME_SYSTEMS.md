# Sistemas del juego

## Mapa general

```text
Entrada desktop/tactil
  -> PlayerController -> movimiento, camara, colision, plantas
  -> WeaponInventory -> Weapon -> eventos de disparo/recarga
       -> WeaponView + AudioSystem + Effects
       -> BallisticsSystem ----------------------+
       -> EnergyProjectiles (solo Zombies)       |
                                                  v
ZombiesMode <- impactos <- HitTarget / entorno / Zombie
       -> PlayerHealth -> game over/restart
       -> PlayerEconomy -> Points
       -> RoundManager -> ZombieManager -> ZombiePool
       -> ZombieArena -> spawns/colliders/transiciones
       -> interacciones -> barreras/puertas/wall buys/pickups/Mystery Box
       -> bajas -> hitos Ray Gun/ZEUS-77
```

## Shell compartido

- `Input` unifica teclado/raton y controles tactiles mediante `InputState`.
- `PlayerController` aplica look, recoil de camara, movimiento, salto y colision opcional del mapa.
- `WeaponInventory` selecciona slots; `Weapon` gobierna gameplay; `WeaponView` anima recargas por fases y `AudioSystem` sincroniza el foley hasta el cierre confirmado.
- `BallisticsSystem` consume el array vivo de colliders y envia impactos al modo activo.
- `Stats`, `AudioSystem`, `Effects`, `HUD` y `AssetManager` son servicios compartidos por `ModeContext`.

## Zombies

```text
RoundManager
  -> descanso de 6 s entre rondas
  -> eventos spawnDue
  -> ZombieSpawner -> ZombiePool -> ZombieManager
  -> Zombie busca ruta/barrera/portal/jugador
  -> sin progreso: ruta acotada -> ajuste local -> spawn valido oculto
  -> ataque -> PlayerHealth -> game over

Impacto en Zombie
  -> dano torso/cabeza
  -> PlayerEconomy: hit o baja
  -> contador de bajas
  -> hitos: Ray Gun (75), ZEUS-77 (115)

Points
  -> PointDoor -> zonas, colliders y spawns activos
  -> WallBuy -> arma o recarga
  -> MysteryBox -> tirada y pickup
  -> WindowBarrier -> recompensa limitada por ronda
```

## Mapas Zombies

- `ClassicArena`: adapta `ShootingRange`, aplica noche, usa spawns abiertos y Mystery Box; no tiene puertas, barreras ni wall buys.
- `BurnedMansionArena`: progresa desde M1911 hacia AK-47 y M4A1 antes de la puerta de 9999; la compuerta pasa de cerrada a abierta antes de retirar su collider, y el bunker ofrece escalera continua, Ray Gun, ZEUS-77, M60 y un final independiente de 30000 puntos.
- `ZombiesMode` posee salud, rondas, economia, armas y progresion; cada `ZombieArena` posee geometria y datos posicionales.
- `ZombieManager` delega el pathfinding en `ZombieNavigationService`: un grid A* por planta derivado de los colliders del mapa (puertas cerradas y barreras atrincheradas sellan sus vanos; al abrirse, el rebuild invalida las rutas). La persecucion decide el objetivo, el servicio decide la ruta, `moveWithCollision` ejecuta sin atravesar geometria y el anti-stuck es la red de seguridad. Detalles en `docs/changes/2026-08-20-zombie-navigation-service.md`.
- `ZombiesRunFlow` impide solapamientos entre `PLAYING`, `ENDING`, `CREDITS`, `FINISHED` y muerte; durante el final se bloquean input, dano, compras, rondas, spawns, proyectiles y audio antes del fundido.
- `ZombieFootsteps` da pasos posicionales 3D: un unico `AudioListener` en la camara (sobre el AudioContext compartido de `AudioSystem`) y un pool de 8 `PositionalAudio` reasignados cada 0.25 s a los zombies vivos mas cercanos; la cadencia sale de la velocidad medida y solo suenan en `walk` con desplazamiento real.

## Armas especiales

- Ray Gun: bolt visible -> impacto directo -> splash radial con falloff lineal -> bajas/economia.
- ZEUS-77: bolt visible -> objetivo inicial -> seleccion pura de cadena -> dano y arcos visuales.
- Jerarquia de potencia buscada: armas normales < Ray Gun << ZEUS-77; parametros de splash y cadena centralizados en `weapons.ts` y `ZombieConfig.ts` (`CHAIN_*`).
- Ambas pasan por `EnergyProjectiles`, no por `BallisticsSystem`.
