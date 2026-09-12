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
- La M1911 usa una corredera de caras planas, acero de reflejo moderado y una pose de cadera más centrada; conserva el alineado ADS y los anclajes mecánicos de recarga y efectos.
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
  -> reaccion visual sin interrumpir la persecucion
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
  Normal/Shiny usan `zombie_walker.glb`; Brutus usa `zombie_brute.glb`. Ambos
  tienen geometria y clips independientes; sus perfiles viven en `ZombieConfig`.
- Un golpe aceptado por `PlayerHealth` reproduce audio, una vibracion angular
  breve y una vineta roja periférica. La invulnerabilidad posterior evita que
  impactos solapados reinicien el feedback, y la vida critica usa otra capa
  tenue que no oculta el centro de la mira.
- Walker recupera el modelo low-poly original de Quaternius (CC-BY 3.0), con
  textura, rig y clips originales, 2116 triangulos y un material. Los normales
  comparten el mismo tinte; la variacion de fase no cambia la cadencia de paso.
  `ZombieManager` sigue pasando la velocidad horizontal medida a la vista para
  detener el ciclo ante colisiones, sin cambiar la velocidad de gameplay.
- Walker usa ojos ambar emisivos pequenos que siguen el hueso de la cabeza; el
  Brute conserva sus ojos propios, ambos sin luces dinamicas. Brutus adopta una
  anatomia humanoide demacrada de 2.30 m, ropa y deterioro cercanos al walker,
  pero con extremidades largas, pecho abierto y rostro asimetrico. Los impactos no
  letales mantienen el estado
  `walk`: el flinch es solo visual y no detiene la persecucion.
- Golpear una ventana usa una animacion aditiva propia sobre `Idle`/`Walk`, con
  lado dominante alterno y sin reciclar el ataque al jugador. El ultimo impacto
  completa un follow-through breve antes de que el zombie atraviese la abertura;
  el cooldown de combate no se reinicia.
- Shiny usa un acabado dorado emisivo y diez estrellas de cuatro puntas que
  siguen el torso animado. `ShinyStars` reutiliza buffers y una textura compartida,
  sin luces ni allocations por frame. Se apaga al morir y se reinicia al reciclar
  el slot; la pausa de simulacion congela tambien los destellos. Cuesta una llamada
  adicional por Shiny, sin dibujar estrellas en normales o Brute.
  `tools/viewers/zombie-viewer.html?compare=1` compara Shiny con normales; `?shiny=1&night=1`
  permite inspeccionar el brillo con poca luz. El visor tiene camara orbital y
  encuadre movil. Este visor no sustituye una medicion de FPS en movil fisico.
- `ZombiePool` precarga reservas por modelo (24 walker, 2 Brute) pero bloquea
  cualquier adquisición al llegar a 24 activos totales. Los cadáveres siguen
  ocupando tanto su reserva visual como el límite especial.
- Brute multiplica salud y reduce velocidad, conserva un radio fisico compatible
  con puertas y mata con cualquier impacto confirmado. Al iniciar el ataque emite
  un rugido grave exclusivo antes del momento de impacto; distancia, linea de vision
  y ventana de esquiva siguen gobernadas por el melee compartido.
- La velocidad calculada por la curva existente recibe un multiplicador de
  introducción de 0.75/0.80/0.85/0.90/0.95 en rondas 1-5; desde ronda 6 el
  multiplicador vuelve a 1 sin alterar salud, cantidad ni spawn.
- `getTypeDiagnostics(round)` expone ronda, probabilidad Brute, ocupación y
  tipo/salud/velocidad activas para QA sin mantener contadores paralelos.

## Mapas Zombies

- `ClassicArena`: adapta `ShootingRange`, aplica noche, usa spawns abiertos y Mystery Box; no tiene puertas, barreras ni wall buys.
- `BurnedMansionArena`: progresa desde M1911 hacia AK-47 y M4A1 antes de la puerta de 9999; el ala este da mas anchura tanto a la sala M4A1 como al acceso y planta inferior del bunker. La compuerta pasa de cerrada a abierta antes de retirar su collider, y el bunker ofrece una escalera continua de canal unico separada del vano por un carril de giro, Ray Gun, ZEUS-77, M60 y un final independiente de 30000 puntos dentro de una sala secreta. Tres lamparas de almas cargadas por bajas cercanas revelan su pared oeste mediante una apertura animada; estado, almas en vuelo y reset pertenecen al mapa. La M4A1 usa una silueta mural propia y esa pared no tiene iluminacion roja decorativa.
- `ZombiesMode` posee salud, rondas, economia, armas y progresion; cada `ZombieArena` posee geometria y datos posicionales.
- `ZombieManager` delega el pathfinding en `ZombieNavigationService`: un grid A* por planta derivado de los colliders del mapa (puertas cerradas y barreras atrincheradas sellan sus vanos; al abrirse, el rebuild invalida las rutas). La persecucion decide el objetivo, el servicio decide la ruta, `moveWithCollision` ejecuta sin atravesar geometria y el anti-stuck es la red de seguridad. Detalles en `docs/changes/2026-08-20-zombie-navigation-service.md`.
- Las transiciones con rampa reutilizan sus extremos como portales del A* y steering; en la aproximacion, pendiente y salida al rellano, `ZombieManager` centra la horda y mantiene separacion longitudinal para que el corredor conecte plantas sin giros prematuros, wall-following, recalculos ni teletransporte.
- `ZombiesRunFlow` impide solapamientos entre `PLAYING`, `ENDING`, `CREDITS`, `FINISHED` y muerte; durante el final se bloquean input, dano, compras, rondas, spawns, proyectiles y audio antes del fundido.
- `ZombieFootsteps` da pasos posicionales 3D: un unico `AudioListener` en la camara (sobre el AudioContext compartido de `AudioSystem`) y un pool de 8 `PositionalAudio` reasignados cada 0.25 s a los zombies vivos mas cercanos; la cadencia sale de la velocidad medida y solo suenan en `walk` con desplazamiento real.
- `SecretRoomSystem` usa un estado puro central, reserva almas mientras viajan para impedir sobrecarga y renderiza sus nucleos, estelas y chispas con tres `Points` de buffers fijos. Las tres luces de lampara carecen de sombras y reducen intensidad/tamano con el perfil de efectos; el audio procedural aplica paneo y atenuacion desde la camara sin crear otro `AudioContext`.
- `WindowBarrierView` mantiene una animacion independiente por tabla: cada golpe zombie arranca una madera hacia el exterior y la suelta en una caida con giro, mientras el HP sigue siendo autoritativo de inmediato. Burned Mansion declara nueve ventanas, cada una emparejada con su hueco de muro y spawn exterior; la reparacion conserva su encaje independiente.
- La Mystery Box pondera sus resultados por rareza: ZEUS-77 es legendaria, aparece con glow dorado y peso 3 frente al peso 10 de Ray Gun; Ray Gun sigue garantizada al alcanzar 115 bajas. Su vista procedural refleja las fases de la maquina con apertura y cierre amortiguados, ruleta flotante y una retirada animada del arma, sin poseer reglas de gameplay. El resultado se revela exactamente 5 segundos despues de la activacion.

## Armas especiales

- Ray Gun: bolt visible -> impacto directo -> splash radial con falloff lineal -> bajas/economia.
- ZEUS-77: bolt visible -> objetivo inicial -> seleccion pura de cadena -> dano y arcos visuales.
- Jerarquia de potencia buscada: armas normales < Ray Gun << ZEUS-77; parametros de splash y cadena centralizados en `weapons.ts` y `ZombieConfig.ts` (`CHAIN_*`).
- Ambas pasan por `EnergyProjectiles`, no por `BallisticsSystem`.
