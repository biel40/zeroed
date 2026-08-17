# Ventana de esquiva en el ataque cuerpo a cuerpo del zombie

**Qué**: el impacto del mordisco se valida en el instante real del golpe (misma planta, distancia ≤ `ZOMBIE_ATTACK_RANGE` y línea de ataque despejada contra la posición actual del jugador) en lugar de quedar decidido al iniciar la animación; `ZOMBIE_ATTACK_HIT_MOMENT` pasa de 0.45 s a 0.57 s.

**Por qué**: el ataque se decidía al empezar el wind-up, así que el daño era prácticamente garantizado aunque el jugador retrocediera de inmediato. Ahora reaccionar a tiempo (retroceder o salir lateralmente del rango) esquiva el mordisco; el zombie termina su animación igualmente y cada ataque impacta como máximo una vez (`attackApplied`).

**Dónde**: `src/zombies/ZombieManager.ts` (snapshot del jugador por frame + `attackStillConnects` en el callback `onAttackLanded`), `src/zombies/ZombieConfig.ts` (hit moment), `tests/zombieManager.test.ts` (5 casos: esquiva retrocediendo, reacción tardía, esquiva lateral, dos zombies simultáneos, zombie muerto a mitad del wind-up).

**Aprendido**: el clip `ZombieBite` es una toma mocap de 5.04 s que se reproduce desde el 30 % a 2.5×; el pico de extensión frontal de la cabeza (medido con FK sobre la cadena de huesos) cae al ~63 % del ataque lógico de 0.9 s — de ahí 0.57 s. Durante el ataque el zombie solo rota (el steering exige estado `walk`), así que no hay deslizamiento hacia el jugador. Los ataques a barreras no revalidan: el objetivo no se mueve. El lado del jugador ya está protegido por `ZombiesMode.onPlayerHit` (game over) y la invulnerabilidad de `PlayerHealth`; el lado del zombie lo garantiza la máquina de estados (morir sale de `attack`).
