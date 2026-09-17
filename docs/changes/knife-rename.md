# Rename Bowie → Knife

- Que: el melee de Zombies deja de llamarse Bowie. La clase, tests, HUD y
  recompensa viven ahora como Knife.
- Por que: el arma es un cuchillo generico del modo, no un Bowie con identidad
  propia. El nombre anterior contaminaba docs, audio y el contrato de input.
- Donde: `src/weapons/Knife.ts`, `tests/knife.test.ts`, `ZombiesMode`,
  `PlayerEconomy`, `ZombieManager`, HUD tactil y docs de arquitectura/economia.
- Aprendido: la baja con cuchillo es una rama exclusiva (`awardKnifeKill`,
  +200) que viaja por `ZombieKillSource`. No se apila con headshot ni con la
  baja normal. La hitbox de cabeza (radio 0.22) es un ajuste de combate
  empaquetado en el mismo working tree, no parte del rename.
