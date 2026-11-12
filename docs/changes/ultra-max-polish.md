# Ajuste de acabado Ultra Max

2026-11-12. Revision de brillo en compras de pared, fogonazos y definicion del
entorno. La captura mencionada en la peticion no venia en los adjuntos; las
causas se han comprobado en el codigo, sin comparacion visual de esa imagen.

- La silueta de compra compartia emision alta con los niveles inferiores y
  el bloom HDR recogia tambien tonos medios. Ultra Max usa ahora un material
  independiente con menor emision y reflejo; el bloom se reserva a luces
  mas intensas. Baja, Media y Alta conservan su material y render originales.
- El nucleo frontal plano y las hojas aditivas del fogonazo acumulaban
  brillo. Se reutiliza la misma malla con un nucleo redondeado, mezcla alfa,
  turbulencia animada y pulsos mas cortos. Los chorros de la Barrett conservan
  la orientacion de su freno. No cambian las mecanicas del arma.
- Los mapas ya tienen normales, rugosidad, mipmaps y anisotropia. Se conserva
  ese trabajo y se suma microrrelieve suave a sus superficies opacas mediante
  `SurfaceDetail`, compartiendo el ruido de armas y zombis. No aumenta la
  resolucion de las texturas ni el presupuesto de sombras, luces o capturas.
  Se reduce el grano y la aberracion de la salida y se acerca el contacto de
  las sombras al reducir sus offsets.
- La oclusion enmascaraba el arma solo en una lectura de profundidad: ahora
  tambien la excluye de las normales reconstruidas y del filtro. Al salir se
  liberan las pasadas de postprocesado y los materiales que su version de
  Three.js no libera por si misma.

Comprobacion automatica: tests deterministas de aislamiento de presets,
materiales compartidos, profundidad de oclusion, liberacion de recursos,
repeticion del fogonazo y anclaje/orientacion de la pistola con ADS y retroceso.
`npm run typecheck` y `npm run build` completados; la suite completa pasa
con `npm run test -- --maxWorkers=2` (203 archivos, 2258 tests). La primera
ejecucion sin limitar workers paso sus casos pero termino con un timeout
interno de comunicacion de Vitest; la repeticion limitada termino sin errores.

Pendiente del usuario: comparar Alta y Ultra Max en la sala de compras de
Burned Mansion, revisar siluetas y parquet desde cerca y en angulo, disparar
la pistola sin apuntar y con ADS (tiros aislados y repetidos), y repetir en
zonas oscuras y junto a lamparas/fuego y en Station 33. Revisar exceso de halo,
duracion y clipping de la llama, sombras separadas o acne, visibilidad en
oscuridad y FPS con `?debug`. Sin validacion visual ni medicion de GPU no se
declara resuelta la apariencia ni se garantiza el coste del microrrelieve.

Comportamiento vigente y fuentes: [rendimiento](../GAME_SYSTEMS.md#rendimiento).
