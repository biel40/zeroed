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
  florecen. La luz ambiente pasa de un estudio generico a la sala real, asi
  que las zonas sin lamparas quedan mas oscuras.
- Pendiente: validacion visual y de rendimiento en el juego. Valores a ajustar
  a ojo: `BLOOM` (`PostProcessing.ts`), `REFLECTION_PROBE`
  (`ReflectionProbe.ts`: relleno, intensidad del entorno, refresco) y los
  perfiles `ZOMBIE_SURFACE_DETAIL` y `WEAPON_SURFACE_DETAIL`
  (`SurfaceDetail.ts`). Sin cubrir: zombis en cooperativo, Capitan URSS,
  brazos en primera persona y sombras dinamicas (hoy ninguna luz las proyecta).
