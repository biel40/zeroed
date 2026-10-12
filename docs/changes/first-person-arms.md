# Brazos y manos en primera persona

- Que: todas las armas de fuego y el cuchillo se sujetan con dos brazos
  procedurales enguantados con dedos articulados. La mano izquierda sujeta el
  guardamanos en C (pulgar a lo largo del lado superior hacia la boca), la
  derecha cierra la empunadura con el indice en el gatillo, y ambas acompanan
  las recargas: la izquierda saca el cargador, va al bolsillo y lo inserta;
  la mano de accion trabaja la manivela, el cerrojo o la corredera.
- Por que: las armas flotaban sin manos y el cuchillo tenia su propio brazo de
  cilindros, sin coherencia con el resto del viewmodel.
- Donde: `src/weapons/FirstPersonArm.ts` (geometria, esqueleto, IK y poses),
  `HandPoses.ts` (datos de dedos), `WeaponHands.ts` (objetivos por arma),
  `ViewArms.ts` (orquestacion en `Game`), `view.hands` en
  `src/config/weapons.ts`, `Knife.ts` (ahora solo cadena FK y modelo) y
  `GameMode.getMeleeArm`.
- Agarres: M1911 a dos manos; M4A1, AK-47, M60 y L96 con mano de apoyo en el
  guardamanos (la L96 bajo la culata delantera, la M60 bajo el tubo de gases,
  delante de la caja de cinta); ZEUS-77 como fusil, con la mano de apoyo en el
  suelo aislado de la camara, detras de la bobina de cobre expuesta; Ray Gun a
  una mano. La M4A1 arma la manivela con la izquierda (su palanca esta a ese
  lado); AK-47, M60 y L96 con la derecha.
- Cuchillo: la mano derecha suelta la empunadura mientras el arma baja,
  sujeta por la izquierda, y vuelve a ella al recuperarse. El modelo del
  cuchillo solo existe entre el 3 % y el 77 % del ataque, cuando hoja y mano
  estan fuera de pantalla. Trayectoria, tiempos e impacto no cambian.
- Aprendido: un brazo creible depende mas de la muneca que de los dedos. El
  codo se sugiere desde la propia mano (prolongacion de una muneca recta, sin
  subir hacia la camara) mezclada con el polo del arma; asi el antebrazo nunca
  apunta al ojo y la muneca no se parte. Con skinning, quince falanges caben
  en cuatro draw calls por brazo.
