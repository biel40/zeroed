# Rediseño del CAPITÁN URSS

- Que: nuevo modelo procedural (coraza de cuero segmentada, arnés de lona,
  estrella facetada, casco de aviador con gafas de lentes rojas, barba gris,
  escudo esmaltado con estrella facetada) con texturas PBR horneadas en codigo,
  y nueva animacion: coreografia pura por estado, muelles amortiguados por
  canal, marcha con pies plantados e IK de piernas y del brazo del escudo,
  impactos direccionales, escudo que cae y se asienta con fisica, vaho, polvo
  y vapor de furia. Sonidos propios de pisada y rugido, y tema de duelo.
- Por que: el modelo anterior (primitivas sueltas, easing exponencial) se leia
  pobre para un jefe final; el combate y sus valores (`CAPTAIN_USSR`,
  `CaptainUssrBrain`) no cambian.
- Decisiones: es un homenaje al arquetipo del supersoldado sovietico, no una
  copia de un personaje con licencia, porque el juego es comercial. La pose
  vive en un `Float64Array` por canales (`POSE`) para muellear sin
  allocations; las patadas de los muelles acotan su amplitud, asi un chorro de
  llamas no acumula sacudidas. El tema de duelo es una pista `lazy`: no se
  precarga y, si su MP3 falta, sigue la musica del mapa, de modo que el codigo
  queda listo antes de tener la cancion.
- Para añadir la cancion: copiar el MP3 a
  `public/assets/audio/captain_ussr_theme.mp3` y registrar su licencia en
  `ASSETS.md`; el volumen esta en `MUSIC_TRACKS.captain_ussr_theme` y el
  fundido al caer en `THEME_FADE_SECONDS` (`ZombiesGuardian`).
- Donde: `src/zombies/guardians/`, `ZombiesGuardian`, `MusicManager`,
  `AudioSystem` y el visor `tools/viewers/guardian-viewer.html`.
