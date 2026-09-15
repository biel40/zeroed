# Sistemas del juego

## Flujo de gameplay

```text
Input -> PlayerController -> WeaponInventory -> Weapon
     -> WeaponView / Audio / Effects
     -> Ballistics o EnergyProjectiles -> HitTarget -> ZombiesMode
     -> PlayerHealth / PlayerEconomy / RoundManager
     -> ZombieManager / ZombiePool / ZombieArena / interacciones
```

## Shell compartido

`Input` unifica desktop y tactil. `PlayerController` gestiona camara, recoil,
movimiento, salto y colision opcional. `Weapon` gobierna cadencia, municion,
ADS, recoil y recarga; `WeaponView` muestra el arma sin manos y
`AudioSystem` sincroniza el foley. `BallisticsSystem` usa raycast segmentado,
gravedad/drag y pool fijo. Impactos directos: cabeza = 3x; el feedback de
headshot no se duplica en splash ni cadena.

## Zombies

- Rondas con descanso de 6 s; limite global de 24 activos. `normal` y `shiny`
  usan walker; `brute` usa modelo propio, reserva maxima 2, mas salud, menor
  velocidad y muerte con impacto confirmado. Shiny anade diez estrellas
  reutilizadas; Brutus anade rugido y ataque letal.
- El melee valida distancia XZ, diferencia vertical, linea de ataque, ventana de
  esquiva e instante de impacto. El feedback de dano respeta invulnerabilidad.
- La navegacion combina steering, A* por planta y anti-stuck. Puertas y
  barreras modifican la topologia; la escalera del bunker es una pendiente
  continua de canal unico, sin teletransporte.
- Pasos: ocho fuentes `PositionalAudio`, reasignadas a los zombies mas cercanos;
  fallback sintetizado si falta el asset.

## Mapas e interacciones

- `ClassicArena`: arena clásica nocturna, spawns abiertos y Mystery Box.
- `BurnedMansionArena`: dos plantas, colision, nueve ventanas, puertas por
  Points, wall buys, bunker, pickups, escalera continua y sala secreta.
- `ZombiesMode` posee run, rondas, salud, economia y progresion; el arena posee
  geometria, colliders, spawns, barreras y puertas.
- Barreras: HP autoritativo, rotura visual independiente y reparacion limitada
  por ronda. Puertas y wall buys cobran de forma atomica.
- Mystery Box: 950 Points, revelado a los 5 s; Ray Gun garantizada a 115 bajas;
  ZEUS-77 es legendaria y encadena objetivos. Ambas usan proyectiles de energia.
- La sala secreta activa tres lamparas con USE, reserva almas en vuelo y abre
  una pared una sola vez por run. El final de 30000 Points pasa por
  `PLAYING -> ENDING -> CREDITS -> FINISHED` y detiene gameplay.

## Rendimiento

Pools conocidos: balistica 32, agujeros 96, casquillos 24, chispas 16, humo 10,
pasos 8 y drops de cargador 12. No se crean objetos en loops criticos; el
perfil de dispositivo limita pixel ratio, sombras y efectos.
