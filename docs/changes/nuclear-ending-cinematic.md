# Cinematica nuclear final

- Que: el final nuclear se rehace como cinematica: alarma con baliza y cuenta
  atras 3-2-1, detonacion con flash, bola de fuego, hongo nuclear tras la
  silueta de la mansion, onda expansiva, temblor de camara, letterbox, ceniza,
  grano y creditos sobre el paisaje arrasado. El simbolo ☢ pasa a SVG.
- Por que: en Chrome se veia mal. El blast era un rectangulo a pantalla
  completa escalado (0.9 → 1.2) que dejaba sus bordes visibles, y la onda era
  una elipse recortada plana por `overflow: hidden`. El glifo ☢ dependia de la
  fuente/emoji de cada sistema. Ademas el estruendo sonaba a los 0.5 s sin
  nada visual que lo acompanara.
- Donde: `index.html` (`#ending-screen`), `src/style.css` (bloque Ending),
  `HUD.showEnding` (`--detonation`), `NUCLEAR_DETONATION_TIME` en
  `ZombiesRunFlow`, retraso de `nuclear_explosion` en `MusicManager`.
- Aprendido: el estilo base de cada capa es el fotograma final y los keyframes
  omiten `to`, asi CREDITS y reduced motion no saltan. Ningun gradiente puede
  salirse de su caja (se recorta en rectangulo). Las capas que se mueven
  (mundo con temblor, ceniza rotada, grano) estan sobredimensionadas para no
  mostrar bordes. Los tiempos son absolutos respecto a `--detonation`, no
  porcentajes de la duracion total.
- Ampliacion: la secuencia pasa de 18 s a 25 s. La onda expansiva impacta
  la camara en `--impact` (muro de polvo + temblor de 6.5 s con rotacion y
  punch-in) y los creditos aparecen a los ~16.7 s. El overscan de
  `.ending-world` sube a 7vmin para el temblor fuerte (el horizonte sube 3vmin
  para compensar). Los tests usan `NUCLEAR_ENDING_DURATION`, no 18 a mano.
