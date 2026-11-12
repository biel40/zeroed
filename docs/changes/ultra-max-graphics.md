# Calidad grafica Ultra Max

- Que: cuarto nivel de calidad, opcional, con frame HDR (MSAA + bloom),
  reflejos locales por sonda cubica y microdetalle procedural en armas y
  zombis. Rama `feature/ultra-max-graphics`.
- Decision (usuario, 2026-11-12): se llama Ultra Max; mas adelante habra un
  nivel Ultra intermedio. Prioridades: reflejos, mejor iluminacion y mejores
  texturas, sobre todo de zombis y armas.
- Por que asi: el juego no tiene texturas de archivo para armas ni mapas (todo
  es procedural) y los dos GLB de zombi traen texturas pequenas, asi que
  "mejores texturas" se resuelve con un volumen de ruido 3D con gradiente,
  muestreado en espacio de modelo: no necesita UVs ni descargas y se atenua
  solo con la distancia por sus mipmaps. Para los reflejos se descarto SSR
  (choca con el rango de profundidad comprimido del arma y con las
  particulas) y los reflejos planares (duplican la escena cada frame y son
  propios de cada mapa).
- Efectos secundarios conocidos: con el frame HDR todo pasa por el tone
  mapping, tambien los materiales `toneMapped: false` (brillos, miras,
  proyectiles de energia), que se ven algo menos saturados y a cambio
  florecen.
- Correccion (usuario, 2026-11-12): la primera version sustituia el entorno
  de estudio por la captura y fijaba su intensidad, y Burned Mansion quedaba
  casi negra: los mapas son interiores oscuros cuya luz ambiente sale de ese
  entorno, con una intensidad que decide cada mapa. Ahora la captura se suma
  al entorno de estudio y la sonda no toca `scene.environmentIntensity`.
- Ampliacion (usuario, 2026-11-12): la primera version se notaba demasiado
  poco para llamarse Ultra Max. Se anaden sombras en tiempo real de dos
  lamparas (`LampShadows`), oclusion ambiental GTAO sobre la profundidad del
  frame (`AmbientOcclusion`), reflejos y luz rebotada a intensidad plena
  (`reflectionGain`), bloom mas fuerte y una salida de pelicula con nitidez,
  vineta, aberracion y grano (`FilmOutputPass`).
- Por que asi la ampliacion: las sombras usan un fondo fijo de mapas que se
  reparte entre lamparas porque cada mapa de sombra de luz puntual ocupa
  decenas de MB y cada lampara cuesta seis pasadas; alternar su refresco deja
  el coste en seis por frame. La oclusion reutiliza la profundidad del frame
  porque una pasada de normales aparte dibujaria las particulas como
  superficies solidas. El arma se enmascara en la oclusion porque su
  profundidad esta comprimida y no dice donde esta.
- Riesgos a mirar: con sombras, las lamparas dejan de atravesar paredes, asi
  que alguna sala puede quedar mas oscura; una lampara cuya bombilla este
  metida en geometria que proyecta sombra oscureceria su zona (`near` de
  `LAMP_SHADOWS` lo evita hasta 0,4 m).
- Fogonazo (usuario, 2026-11-12): en Ultra Max el fogonazo se veia raro.
  Causas: era un disco de degradado radial perpendicular al canon (visto desde
  el tirador, una pegatina plana y simetrica) con el color sin espacio de
  color; en el frame HDR su mezcla aditiva ya no se satura en 1 y el bloom lo
  convertia en un halo grande; la luz del disparo duraba ~0,25 s y, sin el
  recorte del LDR, se notaba despues de la llama; y la sonda de reflejos podia
  capturar ese destello y mantenerlo en el entorno hasta la siguiente
  captura. Ahora `MuzzleFlare` dibuja una llama procedural (una malla y un
  material por arma, sin texturas ni asignaciones por disparo), las hojas
  vistas de canto se desvanecen en vez de verse como lineas, la luz decae al
  4 % al acabar la llama y la sonda apaga esa luz mientras captura. Los
  niveles Baja, Media y Alta no cambian.
- Sin armas de prueba para dos casos pedidos: no hay escopeta ni arma con
  silenciador. Un preset mas ancho y con mas lenguas cubriria la escopeta; una
  silenciada llevaria un preset de brillo y luz casi nulos.
- Pendiente: validacion visual y de rendimiento en el juego. Valores a ajustar
  a ojo: `MUZZLE_FLARES`, `LAMP_SHADOWS`, `AMBIENT_OCCLUSION`, `BLOOM`, `FILM`,
  `REFLECTION_PROBE` y los perfiles `ZOMBIE_SURFACE_DETAIL` y
  `WEAPON_SURFACE_DETAIL`. Sin cubrir: microdetalle en zombis del
  cooperativo, Capitan URSS y brazos en primera persona.
