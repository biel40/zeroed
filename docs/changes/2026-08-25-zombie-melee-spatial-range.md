# Alcance espacial del ataque cuerpo a cuerpo zombie

**Que**: el ataque zombie valida tanto su alcance horizontal XZ de 1.9 m como una diferencia maxima de 1 m entre los pies del jugador y del zombie. La misma comprobacion se ejecuta al iniciar la animacion y en el instante del impacto.

**Por que**: la comprobacion anterior ignoraba Y. Cerca de la escalera, dos entidades con la misma planta logica y XZ proximas podian estar fisicamente separadas en altura y aun asi conectar el mordisco.

**Donde**: `src/zombies/ZombieConfig.ts`, `src/zombies/ZombieManager.ts`, `tests/zombieManager.test.ts`.

**Aprendido**: en Zeroed XZ es el plano horizontal y Y representa altura; `PlayerController.rig.position.y` es la altura de ojos mientras `Zombie.position.y` es la altura de pies. La comparacion vertical debe normalizar ambas posiciones a los pies y conservar la revalidacion del frame de impacto para no romper la esquiva.
