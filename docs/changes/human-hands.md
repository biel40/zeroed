# Manos humanas en primera persona

- Que: los guantes de capsulas se sustituyen por manos desnudas de proporciones
  adultas. Antebrazo, muñeca y palma son una sola superficie con nudillos y
  eminencias tenar e hipotenar; cada dedo es un tubo continuo que se dobla en
  sus articulaciones (almohadillas, pliegues y uña); la piel es un atlas
  horneado en codigo con color, relieve y rugosidad. Esqueleto, poses, IK,
  recargas, cuchillo, mascara de gas y anillos no cambian.
- Por que: las falanges eran capsulas rigidas unidas en cada articulacion
  (dedos de salchicha) sobre un guante liso de color uniforme; se leian como un
  muñeco, no como una mano.
- Donde: `src/weapons/ArmRig.ts` (esqueleto), `SkinnedLoft.ts` (superficie
  con skinning por anillos), `HandModel.ts` (mano, dedos, pulgar y uñas),
  `HandSkinTexture.ts` (atlas de piel y contrato UV), `FirstPersonArm.ts`
  (manga, montaje y nivel de detalle) y `HandRings.ts` (el anillo se ajusta a la
  seccion real del dedo). Los radios de `FINGER_LAYOUT` y `PHALANX_TAPER` son
  ahora los de una mano: `fitHandPose` sigue cerrando los dedos sobre cada pieza.
- Aprendido: en un loft con skinning lineal el dedo debe salir de la palma
  limpiamente: la raiz de cada tubo se estrecha dentro de la palma y la palma
  conserva su anchura hasta la linea de nudillos, que sobresale unos 3 mm del
  dorso de los dedos; si coinciden, asoman islas y cortes. El final de la palma
  se cierra en canto (las membranas entre dedos), no en cupula. La piel cuesta
  un horneado al cargar (512 px en escritorio, 256 px en movil).
