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
  `ThumbRoot.ts` (union continua entre palma y pulgar),
  `HandSkinTexture.ts` (atlas de piel y contrato UV), `FirstPersonArm.ts`
  (manga, montaje y nivel de detalle) y `HandRings.ts` (el anillo se ajusta a la
  seccion real del dedo). Los radios de `FINGER_LAYOUT` y `PHALANX_TAPER` son
  ahora los de una mano: `fitHandPose` sigue cerrando los dedos sobre cada pieza.
- Aprendido: en un loft con skinning lineal el dedo debe salir de la palma
  limpiamente: la raiz de los cuatro dedos se estrecha dentro de la palma y esta
  conserva su anchura hasta la linea de nudillos, que sobresale unos 3 mm del
  dorso de los dedos; si coinciden, asoman islas y cortes. El final de la palma
  se cierra en canto (las membranas entre dedos), no en cupula. La piel cuesta
  un horneado al cargar (512 px en escritorio, 256 px en movil).
- Pulgar: las poses venian del guante de capsulas, simetrico, y su giro sobre
  el propio eje no importaba: todos los pulgares enseñaban la yema a la camara
  y se curvaban hacia fuera de los dedos. Ahora cada pose gira el pulgar sobre
  su eje (Z de `thumb.base`) para que la yema apoye en lo que sujeta y la uña
  mire hacia fuera; girar exactamente media vuelta y negar las flexiones deja
  las articulaciones donde estaban. El agarre de pistola sigue la referencia
  "pulgares adelante": membrana alta bajo la cola del armazon y el pulgar
  derecho recto por el flanco izquierdo, a la altura del seguro, junto al
  izquierdo y hacia la boca (`PISTOL_THUMB`). Cada mano modela y enlaza su
  pulgar en un reposo cercano a sus agarres (`THUMB_REST` por lado en
  `ArmRig.ts`). La base se cose a un hueco de la palma con una banda que
  comparte posiciones, pesos y normales; los atlas de palma y dedo conservan
  sus propias UV. Asi se elimina el aro de dos superficies superpuestas y
  la union permanece cerrada al cambiar de pose. Las falanges se estrechan
  hacia los nudillos y la uña queda sobre una punta ancha y aplanada.
