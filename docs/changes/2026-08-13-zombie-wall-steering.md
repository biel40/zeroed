# Fix: zombies atascados en paredes

**Qué**: los zombies que chocaban frontalmente contra una pared se quedaban
empujando indefinidamente. Ahora rodean el obstáculo y alcanzan al jugador.

**Por qué**: bug reportado — zombies colisionaban con paredes y se quedaban
atascados sin avanzar (jitter contra la pared).

**Dónde**: `src/zombies/ZombieManager.ts` — `steer()` reescrito como
**wall-following** de dos estados, más `lineOfSightClear()`.

**Cómo funciona**:
- **seek**: camino recto al jugador (con separación entre zombies, como antes).
- Un **probe frontal** (1.3× el radio del cuerpo) detecta la pared inminente.
- Al chocar → entra en **round**: sigue la *tangente de la pared*
  (perpendicular a la dirección de aproximación, en el sentido que acerca al
  jugador) a `ROUND_SPEED_FACTOR` de la velocidad. NO mezcla la dirección al
  jugador durante el rodeo.
- Sale del rodeo solo cuando `lineOfSightClear` confirma que el segmento
  COMPLETO hasta el jugador está despejado.
- La integración por ejes (`moveWithCollision`) no cambia: la posición nunca
  entra en el obstáculo, sin teletransportes ni push-out.

**Aprendido** (lo importante, costó tres iteraciones):
- **Las ventanas temporales oscilan.** Los primeros intentos usaban "detectar
  atasco por progreso + escape lateral con expiry". Fracaso: el zombie salía
  del escape a mitad de la pared, volvía a chocar y entraba en yoyo. Nunca
  expirar un escape a ciegas — salir por CONDICIÓN ESPACIAL, no por tiempo.
- **No mezclar direcciones en el rodeo.** Sumar `toPlayer` al vector de escape
  arrastraba al zombie en diagonal LEJOS de la pared en aproximaciones
  diagonales. La tangente pura es la que funciona.
- **Salir al liberar el frente inmediato es insuficiente**: en la esquina el
  frente se libera pero el cuerpo sigue junto a la pared y se re-entra en
  rodeo un metro después (jitter). La condición de salida correcta es la línea
  de vista completa al jugador.
- Los obstáculos son AABBs axis-aligned (`rebuildObstacles` filtra por altura,
  base y superficie), así que la tangente de pared es axis-aligned y el
  deslizamiento es limpio.
- Tests nuevos en `tests/zombieStuck.test.ts` (pared frontal + esquina). El
  test viejo "walls block the straight-line chase" documentaba el contrato
  VIEJO ("se queda pegado") — se actualizó al contrato nuevo ("rodea").
