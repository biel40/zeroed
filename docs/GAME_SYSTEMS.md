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
       -> bajas -> hito Ray Gun (115)
```

## Shell compartido

- `Input` unifica teclado/raton y controles tactiles mediante `InputState`.
- `PlayerController` aplica look, recoil de camara, movimiento, salto y colision opcional del mapa.
- `WeaponInventory` selecciona slots; `Weapon` gobierna gameplay; `WeaponView` compone las armas sin manos del jugador y sus recargas mecánicas por fases, mientras `AudioSystem` sincroniza el foley hasta el cierre confirmado.
- `BallisticsSystem` consume el array vivo de colliders y envia impactos al modo activo.
- Los impactos directos usan una configuracion global: cabeza = 3x dano y 150 Points por impacto; los headshots reutilizan el hitmarker y audio compartidos para una confirmacion breve, mientras splash y saltos secundarios de cadena conservan su dano base y no duplican ese feedback.
- `Stats`, `AudioSystem`, `Effects`, `HUD` y `AssetManager` son servicios compartidos por `ModeContext`.

## Zombies

```text
RoundManager
  -> descanso de 6 s entre rondas
  -> eventos spawnDue
  -> ZombieManager selecciona normal / shiny / brute
  -> ZombieSpawner -> validacion por radio -> ZombiePool
  -> Zombie busca ruta/barrera/portal/jugador
  -> sin progreso: ruta acotada -> ajuste local -> spawn valido oculto
  -> ataque -> PlayerHealth -> game over

Impacto en Zombie
  -> dano torso/cabeza
  -> PlayerEconomy: hit o baja
  -> contador de bajas
  -> hito: Ray Gun (115)

Points
  -> PointDoor -> zonas, colliders y spawns activos
  -> WallBuy -> arma o recarga
  -> MysteryBox -> tirada y pickup
  -> WindowBarrier -> recompensa limitada por ronda
```

- `normal`, `shiny` y `brute` comparten `Zombie`, IA y un máximo global de 24. El melee valida en el inicio y en el instante del impacto la distancia horizontal XZ, una diferencia vertical compatible y la linea de ataque despejada.
  Normal/Shiny usan el modelo `walker`; Brute usa `zombie_brute.glb`, clips y
  silueta propios. Sus perfiles y asignación de modelo viven en `ZombieConfig`.
- `ZombiePool` precarga reservas por modelo (24 walker, 2 Brute) pero bloquea
  cualquier adquisición al llegar a 24 activos totales. Los cadáveres siguen
  ocupando tanto su reserva visual como el límite especial.
- Brute multiplica salud, velocidad y daño y usa un radio físico conservador;
  esos valores alimentan combate, steering, colisión, recuperación y una rejilla
  de navegación con el despeje correspondiente a su tamaño.
- La velocidad calculada por la curva existente recibe un multiplicador de
  introducción de 0.75/0.80/0.85/0.90/0.95 en rondas 1-5; desde ronda 6 el
  multiplicador vuelve a 1 sin alterar salud, cantidad ni spawn.
- `getTypeDiagnostics(round)` expone ronda, probabilidad Brute, ocupación y
  tipo/salud/velocidad activas para QA sin mantener contadores paralelos.

## Mapas Zombies

- `ClassicArena`: adapta `ShootingRange`, aplica noche, usa spawns abiertos y Mystery Box; no tiene puertas, barreras ni wall buys.
- `BurnedMansionArena`: progresa desde M1911 hacia AK-47 y M4A1 antes de la puerta de 9999; el ala este da mas anchura tanto a la sala M4A1 como al acceso y planta inferior del bunker. La compuerta pasa de cerrada a abierta antes de retirar su collider, y el bunker ofrece una escalera continua de canal unico sin pasillos laterales, Ray Gun, ZEUS-77, M60 y un final independiente de 30000 puntos.
- `ZombiesMode` posee salud, rondas, economia, armas y progresion; cada `ZombieArena` posee geometria y datos posicionales.
- `ZombieManager` delega el pathfinding en `ZombieNavigationService`: un grid A* por planta derivado de los colliders del mapa (puertas cerradas y barreras atrincheradas sellan sus vanos; al abrirse, el rebuild invalida las rutas). La persecucion decide el objetivo, el servicio decide la ruta, `moveWithCollision` ejecuta sin atravesar geometria y el anti-stuck es la red de seguridad. Detalles en `docs/changes/2026-08-20-zombie-navigation-service.md`.
- Las transiciones con rampa reutilizan sus extremos como portales del A* y steering; en la aproximacion, pendiente y salida al rellano, `ZombieManager` centra la horda y mantiene separacion longitudinal para que el corredor conecte plantas sin giros prematuros, wall-following, recalculos ni teletransporte.
- `ZombiesRunFlow` impide solapamientos entre `PLAYING`, `ENDING`, `CREDITS`, `FINISHED` y muerte; durante el final se bloquean input, dano, compras, rondas, spawns, proyectiles y audio antes del fundido.
- `ZombieFootsteps` da pasos posicionales 3D: un unico `AudioListener` en la camara (sobre el AudioContext compartido de `AudioSystem`) y un pool de 8 `PositionalAudio` reasignados cada 0.25 s a los zombies vivos mas cercanos; la cadencia sale de la velocidad medida y solo suenan en `walk` con desplazamiento real.
- `WindowBarrierView` mantiene una animacion independiente por tabla: el HP sigue siendo autoritativo de inmediato, mientras impacto, caida y encaje se ejecutan en el update de la arena y siempre terminan restaurando la transformacion original.
- La Mystery Box pondera sus resultados por rareza: ZEUS-77 es legendaria, aparece con glow dorado y peso 3 frente al peso 10 de Ray Gun; Ray Gun sigue garantizada al alcanzar 115 bajas. Su vista procedural refleja las fases de la maquina con apertura y cierre amortiguados, ruleta flotante y una retirada animada del arma, sin poseer reglas de gameplay. El resultado se revela exactamente 5 segundos despues de la activacion.

## Armas especiales

- Ray Gun: bolt visible -> impacto directo -> splash radial con falloff lineal -> bajas/economia.
- ZEUS-77: bolt visible -> objetivo inicial -> seleccion pura de cadena -> dano y arcos visuales.
- Jerarquia de potencia buscada: armas normales < Ray Gun << ZEUS-77; parametros de splash y cadena centralizados en `weapons.ts` y `ZombieConfig.ts` (`CHAIN_*`).
- Ambas pasan por `EnergyProjectiles`, no por `BallisticsSystem`.
