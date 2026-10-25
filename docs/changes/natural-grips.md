# Agarres naturales en primera persona

- Que: las manos sujetan las armas como en un FPS de referencia. La derecha
  cierra el puno sobre la empunadura con el indice apoyado en la cara del
  gatillo y el pulgar rodeando el lomo hasta el flanco izquierdo; la de apoyo
  acuna el guardamanos desde abajo con los dedos subiendo por el lado lejano y
  el pulgar a lo largo del cercano; la M1911 se sujeta a dos manos con los
  pulgares adelante. En las recargas, la izquierda llega a la manivela de la
  M4A1 y a la corredera de la M1911 desde su propio lado.
- Por que: el IK con hombros fijos doblaba las munecas entre 60 y 116 grados
  y retorcia el antebrazo hasta 175 grados; los dedos, con curvas fijas, no
  tocaban las piezas (flotaban delante del brocal o se hundian en ellas).
- Donde: `FirstPersonArm.reachGrip` (antebrazo y torsion), `ViewArms`
  (anclas de hombro), `HandPoses.fitHandPose` (cierre de dedos),
  `WeaponHands` (ajuste por agarre, cacheado por config) y `hold`/`trigger`
  en `view.hands` de `src/config/weapons.ts`. La empunadura de la M60 se
  adelanta 2 cm para que el indice alcance su gatillo.
- Aprendido: en un viewmodel el hombro no se ve, asi que conviene que siga a
  la mano y no al reves: el antebrazo prolonga la mano (cede un 20 % hacia el
  hombro, nunca sube hacia el ojo ni sale de un cono de 50 grados) y la
  torsion vive en el antebrazo, no en la muneca. La orientacion configurada
  de cada agarre fija tambien el brazo, por eso la mano derecha se inclina
  unos 12 grados menos que su empunadura. Describir la pieza sujetada (seccion
  y eje) basta para cerrar los dedos de cualquier arma; el acoplamiento
  tendinoso (la falange distal sigue a la media) evita poses imposibles.
- Apoyo de pistola: el volumen que rodea la izquierda representa la mano
  derecha ya cerrada, no una caja sobredimensionada. Su palma queda mas
  retrasada y los dedos se cierran sobre los de la derecha; el contacto se
  valida contra la piel deformada de esa mano, ademas de contra el volumen
  de agarre. Los pulgares mas cortos conservan la base cosida a la palma.
- Linea de mira: los dedos de los agarres de reposo nunca suben a menos de
  1 cm de la linea de mira (antes la mano de apoyo de la AK tapaba el punto
  de mira). La M1911 se monta con la palma sobre el canto superior izquierdo
  de la corredera y el antebrazo subiendo desde abajo; correderas y
  manivelas se sueltan al final del recorrido y vuelven solas.
