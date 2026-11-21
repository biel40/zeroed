# EXHALIS base: Arco del Viento sin mision — 2026-11-20

Primera fase del Arco del Viento de Die Kathedrale: solo el arma base. La
mision, las piezas, el montaje y la version mejorada no se implementan. El
comportamiento vigente esta en [sistemas](../GAME_SYSTEMS.md) y la intencion
del mapa en [Die Kathedrale](../DIE_KATHEDRALE.md); esta nota conserva el
motivo de los valores iniciales y por donde entrara la mejora.

## Valores iniciales y motivo

Fuente: [definicion](../../src/config/weapons.ts). Ninguno se ha probado aun
en partida.

| Valor | Motivo |
| --- | --- |
| 450 de dano directo | Mata de un disparo al torso hasta la ronda 10 (unos 433 de vida); desde la 11 (unos 480) ya no |
| Rafaga 160, radio 3 m, hasta 8 cuerpos | Ablanda sin limpiar: la VORTEX-9 suma 400 + 600 |
| Empujon 3,4 m en 0,38 s; 45 % en el borde | Abre el ancho de un pasillo de catacumbas sin sacar a la horda de la sala |
| Bruto al 25 % (`knockbackScale`) | No trivializa al enemigo mas peligroso; sigue tambaleandose por el dano |
| 75 rpm, 6 + 36 ampollas, recarga 2,6 s | Pocos disparos decisivos; no sostiene una ronda alta por si solo |
| 3500 / 1750 en el altar | Mismo escalon que la ФАКЕЛ-33 en Station 33 |

## Integracion provisional

El altar del relicario lo vende como un `ArenaWeaponStation`
([`ExhalisAltarOffering`](../../src/zombies/maps/dieKathedrale/catacombs/ExhalisAltarOffering.ts),
datos en `EXHALIS_ALTAR_OFFERING`). La mision solo tiene que quitar esa
estacion de `DieKathedraleArena.weaponStations` y entregar el arma al montar
las tres piezas; el arma, el disparo y el empujon no dependen de como se
consigue.

## Puntos de extension para la mejora

- Dano y municion: la escala de dano y la capacidad de una mejora
  (`weaponDamageScale`, `setCapacityScale`) ya se aplican al golpe directo y a
  la rafaga.
- Empujon, alcance, radio e intensidad visual: son datos de `WindWeaponConfig`
  (incluido `look`, que `WindShots` lee por disparo); una version mejorada es
  otra config que el modo pase a `ZombiesWindShots`.
- Aspecto y nombre: el modelo es `frame: 'exhalis'` y el nombre el de la
  definicion o el catalogo del mapa.
