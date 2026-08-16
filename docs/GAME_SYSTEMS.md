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
GameMode <- impactos <- HitTarget / entorno / Zombie
  -> ShootingRangeMode -> Targets -> Stats -> HUD
  -> ZombiesMode
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
- `WeaponInventory` selecciona slots; `Weapon` gobierna gameplay; `WeaponView` representa el arma.
- `BallisticsSystem` consume el array vivo de colliders y envia impactos al modo activo.
- `Stats`, `AudioSystem`, `Effects`, `HUD` y `AssetManager` son servicios compartidos por `ModeContext`.

## Campo de tiro

```text
WEAPON_ORDER (M4A1, AK-47, M60, L96, M1911)
  -> disparo balistico
  -> Target de acero/papel
  -> reaccion + efectos
  -> Stats (disparos, impactos, precision, distancia)
  -> HUD + telemetro
```

## Zombies

```text
RoundManager
  -> eventos spawnDue
  -> ZombieSpawner -> ZombiePool -> ZombieManager
  -> Zombie busca ruta/barrera/portal/jugador
  -> sin progreso: ruta acotada -> ajuste local -> spawn valido oculto
  -> ataque -> PlayerHealth -> game over

Impacto en Zombie
  -> dano torso/cabeza
  -> PlayerEconomy: hit o baja
  -> contador de bajas
  -> hitos: ZEUS-77 (100), Ray Gun (115)

Points
  -> PointDoor -> zonas, colliders y spawns activos
  -> WallBuy -> arma o recarga
  -> MysteryBox -> tirada y pickup
  -> WindowBarrier -> recompensa limitada por ronda
```

## Mapas Zombies

- `ClassicArena`: adapta `ShootingRange`, aplica noche, usa spawns abiertos y Mystery Box; no tiene puertas, barreras ni wall buys.
- `BurnedMansionArena`: sustituye el range visible; aporta paredes, cinco barreras iniciales mas una de bunker, dos puertas, tres wall buys, bunker, pickup Ray Gun y transiciones de planta.
- `ZombiesMode` posee salud, rondas, economia, armas y progresion; cada `ZombieArena` posee geometria y datos posicionales.
- `ZombieManager` invalida decisiones de navegacion al cambiar colliders, por lo que puertas y zonas abiertas se reflejan inmediatamente.

## Armas especiales

- Ray Gun: bolt visible -> impacto directo -> splash radial -> bajas/economia.
- ZEUS-77: bolt visible -> objetivo inicial -> seleccion pura de cadena -> dano y arcos visuales.
- Ambas pasan por `EnergyProjectiles`, no por `BallisticsSystem`.
