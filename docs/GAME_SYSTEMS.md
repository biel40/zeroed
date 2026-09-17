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
- La cabeza usa una hitbox ajustada al craneo. Un headshot concede 150 Points y
  una baja con cuchillo concede 200 Points por su mayor riesgo y dificultad.
- Si todas las armas transportadas agotan cargador y reserva, el modo equipa
  automaticamente un Knife que no ocupa ranura. La cuchillada aplica 150 de
  dano en su contacto visual, tiene 2.05 m de alcance y usa el primer collider
  bajo la mira, por lo que paredes y enemigos cercanos bloquean el golpe. Con
  municion disponible funciona como melee rapido mediante 3 (o NUM 3) o el
  boton KNIFE del HUD tactil, sin cambiar el arma equipada.
- La navegacion combina steering, A* por planta y anti-stuck. Puertas y
  barreras modifican la topologia; la escalera del bunker es una pendiente
  continua de canal unico, sin teletransporte.
- Pasos: ocho fuentes `PositionalAudio`, reasignadas a los zombies mas cercanos;
  fallback sintetizado si falta el asset.
- Animacion: idle, marcha, persecucion y muerte se generan sobre los esqueletos
  existentes y se cachean por modelo. El mixer reproduce los ciclos; el apoyo
  de la marcha se calibra al desplazamiento real y conserva fase al cambiar de
  velocidad. El cambio walk/run tiene histeresis para evitar alternancias. En
  walkers se conserva la mayor parte del movimiento superior authored y una
  capa determinista sutil desfasa torso, cabeza y brazos; no modifica piernas
  ni apoyo.
- Melee y ventanas usan tres variantes (un brazo por lado y dos manos), con
  anticipacion, contacto a 0.475 s y recuperacion. Los brazos apuntan al blanco
  comprometido, conservan la muneca local y comparten el movimiento de la tabla
  tras el impacto. La ultima tabla continua el ataque sin reiniciar la mezcla.
  Salir del area del golpe durante la anticipacion permite esquivarlo.
- Los cambios de estado mezclan posicion y rotacion desde la pose visible.
  Los impactos leves son aditivos y breves; la muerte conserva impulso y altura
  de planta, con variacion lateral y sin ragdoll. El steering frena los cambios
  de direccion, manteniendo las restricciones de paredes y rampas.

## Mapas e interacciones

- `ClassicArena`: arena clásica nocturna, spawns abiertos y Mystery Box.
- `BurnedMansionArena`: dos plantas, colision, nueve ventanas, puertas por
  Points, wall buys, bunker, pickups, escalera continua y sala secreta.
- `ZombiesMode` posee run, rondas, salud, economia y progresion; el arena posee
  geometria, colliders, spawns, barreras y puertas.
- Barreras: HP autoritativo, rotura visual independiente y reparacion limitada
  por ronda. Puertas y wall buys cobran de forma atomica.
- Los golpes a ventanas validan separacion del marco, alineacion lateral y
  linea de contacto. Cada tiron hace vibrar la tabla o la arranca hacia fuera;
  el ultimo completa su recuperacion antes de retomar la ruta de entrada.
- Mystery Box: 950 Points, revelado a los 5 s; Ray Gun garantizada a 115 bajas;
  ZEUS-77 es legendaria y encadena objetivos. Ambas usan proyectiles de energia.
- La sala secreta activa tres lamparas con USE, reserva almas en vuelo y abre
  una pared una sola vez por run. El final de 30000 Points pasa por
  `PLAYING -> ENDING -> CREDITS -> FINISHED` y detiene gameplay.

## Rendimiento

Pools conocidos: balistica 32, agujeros 96, casquillos 24, chispas 16, humo 10,
pasos 8 y drops de cargador 12. No se crean objetos en loops criticos; el
perfil de dispositivo limita pixel ratio, sombras y efectos.

Burned Mansion fusiona los 17 peldaños visuales de la escalera en una sola
malla y mantiene un presupuesto local estable de luces puntuales: seis en el
perfil completo y cuatro con efectos reducidos. Asi el hueco que deja visibles
ambas plantas no obliga a evaluar simultaneamente todas las luces decorativas.
