# Mejora: ataques a barreras, velocidad por ronda y HUD

## Que cambio

- `barrierAttack` reproduce el mismo clip de golpe que el ataque al jugador,
  tanto con el GLB como con el humanoide procedural de respaldo.
- La velocidad crece un 5 % por ronda desde 1x y queda limitada a 1.8x.
- El HUD de Zombies deja de mostrar el numero de enemigos restantes.

## Por que

La maquina de estados ya sincronizaba el dano a las tablas con el momento de
impacto, pero `ZombieVisual` no registraba una accion para `barrierAttack` y el
zombie seguia mostrando la caminata. La curva anterior (3.5 %, maximo 1.6x)
tambien hacia poco perceptible la progresion entre rondas.

## Donde

- `src/zombies/ZombieVisual.ts`
- `src/zombies/ZombieConfig.ts`
- `src/ui/HUD.ts`
- `src/modes/ZombiesMode.ts`
- `index.html`
- `tests/zombieVisual.test.ts`
- `tests/rounds.test.ts`

## Aprendido

Los estados que comparten un clip deben registrarse igualmente en el mapa de
acciones del mixer; declarar candidatos en la configuracion no basta si el
constructor no recorre ese estado.