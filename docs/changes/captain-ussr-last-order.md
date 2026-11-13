# CAPITÁN URSS: PROTOCOLO DE CONTENCION y ULTIMA ORDEN

- Que: la fase 1 no cambia. Las fases pasan al 70 % y al 35 % de vida. La
  fase 2 añade el golpe al suelo, persecucion mas rapida, refuerzos de zombis,
  luz roja de emergencia, sirenas y avisos por los altavoces del patio, y
  chispas en sus bordes. La fase 3 añade la carga doble, la onda expansiva,
  la armadura dañada con arcos electricos, la bocina, el parpadeo controlado
  y descargas en el campo.
- Por que: las fases 2 y 3 solo cambiaban el ritmo y la probabilidad de carga,
  y el climax del Protocolo 33 se leia igual que su arranque.
- Decisiones:
  - Cada ataque de area avisa con su marca roja en el suelo y la vuelve
    esquivable. El cono del golpe deja de apuntar al final de la carga y la
    onda se evita quedando fuera de su alcance o saltandola.
  - Ni la onda ni el golpe al suelo se repiten seguidos. La onda se extingue
    antes de que pueda empezar el siguiente ataque, asi que el jefe nunca
    solapa dos daños suyos. Un test fija esta invariante de valores.
  - La carga doble solo continua si la primera no choca: chocar sigue siendo
    el premio.
  - Los refuerzos usan el `spawnZombie` de la run, sus puntos de aparicion
    y un tope sobre todos los zombis vivos. Nunca aparecen mientras el jefe
    ataca y no se acumulan.
  - El modo no conoce el mapa. Station 33 declara `loudspeaker` y presenta la
    fase con `showDuelPhase` sobre sus luces de superficie. Las sirenas y los
    avisos reutilizan los sonidos de la evacuacion.
  - El duelo sigue siendo solo individual, como toda la evacuacion.
