# EXHALIS: tension progresiva, flecha fisica y rafaga reforzada — 2026-11-21

La EXHALIS base se quedaba corta: la rafaga apenas se notaba, no habia disparo
cargado y la flecha de la vista era un cono brillante. El comportamiento
vigente esta en [sistemas](../GAME_SYSTEMS.md); esta nota conserva el motivo de
los valores y las decisiones. Ninguno se ha probado aun en partida.

## Valores y motivo

Fuente: [definicion](../../src/config/weapons.ts). Relativos a la
[primera version](exhalis-base.md) (radio 3 m, empujon 3,4 m, 8 cuerpos).

| Valor | Motivo |
| --- | --- |
| Rafaga base 4,05 m (x1,35), empujon 4,25 m (x1,25), 10 cuerpos | Se nota contra grupos sin tensar; el dano de rafaga y su caida no cambian |
| Tension completa en 1,5 s | Casi dos intervalos de disparo (0,8 s): tensar al maximo es un compromiso visible |
| Completa: dano directo x2,2 (990), rafaga 5,4 m (x1,8 del original), empujon 6,8 m (x2), velocidad x1,5, 14 cuerpos, dano de rafaga x1,25 | Recompensa clara sin limpiar la sala: el dano de rafaga apenas sube |
| Empujon completo en x1,25 de tiempo (0,475 s) | 6,8 m en 0,38 s se leia como teletransporte |
| Cono solo con tension completa y cuerpo alcanzado: 7 m tras la rafaga, 20°, 6 cuerpos, 4,5 m sin dano | Funcion tactica propia en los pasillos estrechos de las catacumbas; sin dano para no convertirlo en un arma de limpieza |

## Decisiones

- La tension vive en `Weapon` como dato generico (`charge`), no en el modo:
  municion, cadencia, recarga y cambio de arma ya estaban ahi, y asi el
  disparo sigue gastando una sola ampolla por las reglas existentes.
- Interrumpir cancela, no dispara: pausa, menu, derribo, cuchillo y manos
  ocupadas leen el gatillo suelto, y soltarlo ahi dispararia sin querer.
- La flecha de la vista y la del vuelo comparten geometria
  ([`ExhalisArrow`](../../src/weapons/ExhalisArrow.ts)); su teselado es bajo
  porque el altar del relicario muestra el arco en la escena y Die Kathedrale
  esta al limite de su presupuesto de triangulos.
- Mejora futura (KOVKA): una version mejorada solo cambia datos de `wind`
  (incluido `charged`) y `charge`; los valores visuales de la vista no son
  estadisticas de juego.
