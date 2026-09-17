# Escalado del cuchillo por ronda

- Que: el cuchillo necesita tantos impactos para matar como indique la ronda
  actual: uno en ronda 1, dos en ronda 2 y asi sucesivamente.
- Por que: el dano fijo eliminaba la progresion de resistencia de Zombies.
- Donde: `src/weapons/Knife.ts`, `src/modes/ZombiesMode.ts` y
  `tests/knife.test.ts`.
- Aprendido: calcular el dano como `maxHp / round` conserva la regla para cada
  variante de zombie, incluso cuando su vida maxima sea distinta.