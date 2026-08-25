# Balance del combate cuerpo a cuerpo zombie

**Que**: el ataque del zombie normal conserva su animacion de `0.75 s` y el impacto/ventana de esquiva de `0.475 s`, pero reduce el recovery de `0.7 s` a `0.3375 s`. El ciclo inicio-a-inicio pasa de `1.45 s` a `1.0875 s` (25 % menos). Shiny, Brute y ataques a barricadas conservan sus recoveries. La vida maxima pasa de 100 a 75 HP frente a 25 de dano normal, y el HUD muestra un filtro rojo mientras un siguiente golpe normal sea letal.

**Por que**: aumenta la presion del zombie normal sin acortar la reaccion justa que permite salir del rango antes del impacto, sin dobles impactos y sin modificar sistemas no relacionados.

**Donde**: `src/zombies/ZombieConfig.ts`, `src/zombies/Zombie.ts`, `src/modes/ZombiesMode.ts`, `src/ui/HUD.ts`, `src/style.css` y sus pruebas de salud/ataque.

**Aprendido**: la duracion visual, el instante de impacto y el cooldown ya eran conceptos separados. Reducir solo el recovery mantiene intacta la revalidacion espacial del dodge y deja `1.0875 s` entre impactos consecutivos, por encima de la invulnerabilidad de `0.45 s`.
