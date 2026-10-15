# Tajo lateral del cuchillo

- Que: la estocada frontal se sustituye por un tajo rapido de derecha a
  izquierda inspirado en el melee de Black Ops. El arma equipada baja, entra la
  mano por la derecha, el filo cruza la mira en diagonal descendente y el brazo
  se retira por debajo antes de que vuelva el arma.
- Por que: la estocada se leia como un empuje hacia la mira, no como un corte.
- Donde: `src/weapons/Knife.ts`, `WeaponView.update` (parametro `lowering`),
  `GameMode.getMeleeArm` (antes `getFirearmLowering`) en los tres modos y el visor
  `tools/viewers/weapon-viewer.html?view=knife`.
- Aprendido: el brazo es una cadena hombro-codo-mano con la mano fija al
  antebrazo; las poses clave se resolvieron offline contra posicion de mano,
  direccion de hoja y filo. La interpolacion Hermite mantiene velocidad
  continua a traves del contacto (sin chasquido de codo). El impacto ocurre al
  30 % de los 0.72 s (0.216 s, antes 0.39 s); duracion, dano, alcance y
  seleccion de objetivo no cambian.
- Pulido: la subida se detiene en una breve tension hacia la derecha (el
  hombro echa la hoja atras, no el codo) antes de soltar el tajo; el corte
  acelera hasta su velocidad maxima justo en el contacto (antes frenaba al
  llegar), muerde con una frenada fuerte, se asienta abajo a la izquierda y la
  retirada cae sin pararse a mitad. Cada clave Hermite lleva un `drive` que
  escala su tangente; en el contacto el codo, casi recto, usa menos que el
  hombro para no dar un tiron. Duracion, momento del impacto, alcance y ventana
  del modelo (3 %-77 %) no cambian.
