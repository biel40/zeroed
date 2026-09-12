# Mejora: animacion zombie al romper ventanas

## Que cambio

Los zombies usan una secuencia propia al golpear ventanas: `barrierAttack` se construye sobre una pose tranquila y ya no reproduce los clips `ZombieBite` o `BruteSmash` usados contra el jugador. Cada golpe alterna el lado dominante y combina anticipacion, carga lateral, impacto con ambos brazos y recuperacion.

Cuando el impacto destruye la ultima tabla, el atacante pasa a `barrierBreak`: conserva el impulso del golpe durante 0.34 s y vuelve gradualmente a una pose de avance. Los demas zombies que estaban atacando esa ventana cancelan su golpe al detectar que ya esta abierta. El cooldown se conserva en ambos casos.

`ZombieVisual` aplica la secuencia de forma aditiva al torso, cabeza, hombros y antebrazos del GLB. El fallback procedural reproduce la misma intencion corporal, y los offsets se retiran antes de evaluar el siguiente frame para no contaminar caminar, recibir impactos o morir.

Los ojos del walker usan una cuenca plana oscura, un halo ambar y un nucleo amarillo palido. Las capas quedan integradas en la cara, comparten geometria y materiales entre instancias, y consiguen el brillo clasico de zombie sin globos salientes, reflejos blancos ni luces dinamicas.

Durante las pausas estacionarias entre golpes se mantiene un balanceo leve, sin hacer avanzar los pies. El Brute cargado desde GLB conserva sus ojos originales sin superponer los genericos; el fallback mantiene sus ojos procedurales.

El visor admite `state=barrierAttack` y resuelve el GLB desde la base de Vite, no desde la carpeta del visor. Se comprobo render y movimiento del walker en escritorio y movil; queda pendiente valorar la secuencia completa frente a una barrera dentro de una partida.

## Por que

La barrera ya tenia un estado separado a nivel de gameplay, pero visualmente seguia resolviendo el mismo clip que el ataque al jugador y solo anadia una inclinacion global. El resultado seguia leyendo como una mordida reciclada, no como esfuerzo contra madera.

Cancelar directamente a caminar al caer la ultima tabla tambien cortaba el golpe justo en el impacto. La breve fase final hace visible el peso aplicado sin prolongar la cadencia general ni permitir un ataque inmediato al jugador.

Ademas, la pose procedural de ataque era estatica y los ojos eran dos esferas uniformes, lo que hacia que los zombies parecieran congelados y con una mirada plana al golpear las tablas.

## Donde

- `src/zombies/Zombie.ts`
- `src/zombies/ZombieManager.ts`
- `src/zombies/ZombieVisual.ts`
- `tests/zombieManager.test.ts`
- `tests/zombieVisual.test.ts`

## Aprendido

La cancelacion debe ocurrir antes de perder la referencia al objetivo. Tambien debe preservar el cooldown del golpe para no permitir un ataque inmediato al jugador tras abrir la ventana.

La fase visual de una accion estacionaria debe avanzar con `dt`, no con la velocidad de movimiento. Para detalles repetidos del pool conviene compartir geometria, pero mantener materiales por instancia para conservar el fade individual.

Una animacion aditiva sobre huesos permite dar una accion especifica a los dos modelos sin duplicar assets. Los offsets deben deshacerse antes de que `AnimationMixer` evalue la base del siguiente frame para que la pose no se acumule.
