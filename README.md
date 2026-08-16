# Three.js Shooting Range - Zeroed.ts

Pequeño campo de tiro FPS de navegador construido con Three.js y TypeScript.
Cuatro armas con personalidad propia (M4A1, AK-47, M60, L96), balística con
tiempo de vuelo y caída, recoil con componente aprendible, ADS con scope para
el francotirador y blancos reactivos a 25/50/100/200 m.

## Tecnologías

- **TypeScript** (modo estricto)
- **Three.js** — render WebGL, raycasting, escena
- **Vite** — dev server y build
- **Vitest** — tests de la lógica determinista
- **Web Audio API** — sonido procedural, sin assets de audio
- Sin frameworks de UI, sin motores de física. Dependencia única: `three`.

## Instalación y ejecución

```bash
npm install
npm run dev
```

Abre la URL que indica Vite (por defecto `http://localhost:5173`), pulsa
**CLICK TO START** y el navegador bloqueará el puntero.

## Controles

| Entrada | Acción |
| --- | --- |
| `WASD` | Movimiento |
| Ratón | Cámara |
| `LMB` | Disparar |
| `RMB` | Apuntar (ADS) |
| `R` | Recargar |
| `X` | Cambiar modo de fuego (M4A1 / AK-47) |
| `1` `2` `3` `4` | M4A1 / AK-47 / M60 / L96 |
| `ESC` | Liberar el puntero |

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck estricto + build de producción en `dist/` |
| `npm run preview` | Sirve el build de producción |
| `npm run test` | Tests unitarios (Vitest) |
| `npm run typecheck` | Solo `tsc --noEmit` |

## Arquitectura

```
src/
  core/Game.ts              Raíz de composición: renderer, loop, cableado
  assets/AssetManager.ts    Carga GLB/texturas con caché, progreso real y fallback
  config/weapons.ts         Definiciones declarativas de las 4 armas
  player/Input.ts           Listeners DOM centralizados (con dispose)
  player/PlayerController.ts Rig FPS: yaw → pitch → cámara (recoil en cámara)
  weapons/Weapon.ts         Lógica pura de arma: cadencia, munición, estados
  weapons/RecoilController.ts Acumulación/recuperación de recoil (puro)
  weapons/SpringRecoil.ts   Capa visual de recoil por muelles (pura, testeable)
  weapons/WeaponView.ts     View model: GLB o fallback procedural + sway/bob/ADS
  weapons/WeaponTypes.ts    Contratos (WeaponDefinition, eventos, configs)
  shooting/trajectory.ts    Integración balística pura (testeable)
  shooting/BallisticsSystem.ts Proyectiles + raycast por segmentos + trazadoras
  shooting/HitTarget.ts     Interfaz estructural + tipos de superficie
  range/ShootingRange.ts    Escenario PBR, props, iluminación, señales
  range/Target.ts           Blancos reactivos (acero con muelle, papel con decals)
  rendering/Effects.ts      Pools: bullet holes, casquillos, chispas, humo
  audio/AudioSystem.ts      Sonido procedural Web Audio
  ui/HUD.ts                 HUD DOM + pantalla de inicio con progreso real
  game/Stats.ts             Estadísticas de disparo
public/assets/              GLBs de armas y texturas PBR (ver ASSETS.md)
tests/                      Tests de lógica pura (sin WebGL)
```

Decisiones clave:

- **Lógica de armas 100% libre de Three.js.** `Weapon`, `RecoilController` y
  `trajectory` son TypeScript puro: se testean sin navegador y el renderizado
  se suscribe a una cola de eventos (`shot`, `reloadStart`, `boltStart`…).
- **Las 4 armas son la misma clase.** Toda la personalidad vive en
  `WeaponDefinition` (cadencia, recoil, bloom, ADS, proyectil, manejo). No hay
  subclases por arma.
- **Recoil en dos canales.** `cameraShare` reparte cada kick entre cámara
  (afecta a la puntería) y view model (solo visual). El vertical es casi
  determinista —se aprende a compensar— y el horizontal lleva la aleatoriedad
  acotada (`horizontalBias` + varianza).
- **Balística por segmentos.** Cada proyectil integra su trayectoria en
  subpasos de máximo 3 m y raycastea el segmento, así no hay tunneling aunque
  una placa de acero tenga 3 cm. Sin rigid bodies ni objetos por bala: pool
  fijo de 32 proyectiles con una trazadora reutilizada cada uno.

## Sistema de armas

| | M4A1 | AK-47 | M60 | L96 |
| --- | --- | --- | --- | --- |
| Modos | AUTO/SEMI | AUTO/SEMI | AUTO | SEMI (bolt-action) |
| Cadencia | 800 rpm | 600 rpm | 550 rpm | Cerrojo 1.35 s |
| Cargador | 30 | 30 | 100 | 5 |
| Recoil | Moderado | Alto, deriva | Muy alto | Unico fuerte |
| Bloom sostenido | Bajo | Medio | Muy alto | — |
| ADS | Rápido | Rápido | Lento, FOV 62 | Scope FOV 16 |
| Movimiento | 100 % | 96 % | 82 % | 90 % |

La dispersión tiene base (hip/ADS) + **bloom** que crece por disparo y se
recupera linealmente: las ráfagas cortas son precisas, el fuego sostenido con
la M60 castiga. El ADS reduce sensibilidad, spread y recoil según cada arma.

### Añadir un arma nueva

1. Añade su `WeaponId` en `src/weapons/WeaponTypes.ts`.
2. Añade su `WeaponDefinition` en `src/config/weapons.ts` y su id a
   `WEAPON_ORDER` (la posición define la tecla 1-4).
3. Opcionalmente ajusta `view` (colores, cargador, óptica) para el placeholder
   procedural.

No hay que tocar ninguna clase: la definición lo gobierna todo.

### Pipeline de assets (GLB + fallback)

M4A1, AK-47 y L96 cargan modelos GLB reales (CC0, Quaternius — ver
`ASSETS.md` para fuentes y licencias). La M60 usa el modelo procedural
mejorado (no se encontró LMG CC0 adecuada).

- `AssetManager` carga todo antes de mostrar CLICK TO START, con progreso
  real en pantalla, caché única y `console.warn` por asset fallido.
- Si un GLB falta o falla, el arma usa automáticamente el modelo procedural:
  el juego siempre funciona.
- `WeaponView` normaliza el GLB a la longitud real (`view.modelLength`),
  corrige orientación (`view.modelYaw`), deriva la línea de mira desde el
  bounding box para el ADS y ajusta materiales PBR por nombre (`Wood`,
  `DarkMetal`, `Glass`…).
- Para sustituir un modelo: reemplaza el `.glb` en
  `public/assets/weapons/<id>/model.glb` y ajusta `modelLength`, `modelYaw`
  y los trims `hip`/`ads` en `config/weapons.ts`.

### View model de primera persona

Cada arma tiene personalidad visual propia (todo en `ViewModelConfig`):

- **Sway**: retardo suavizado frente al ratón, reducido 80 % en ADS.
- **Bob**: depende de la velocidad real, suprimido al apuntar.
- **Recoil visual**: muelle independiente por arma (`SpringRecoil`:
  traslación + pitch + roll con stiffness/damping propios). El recoil de
  gameplay (cámara) no cambia.
- **Animaciones de estado**: reload, equip y ciclo de cerrojo procedurales.
- Muzzle flash con sprite aditivo + luz puntual reutilizada + humo sutil.

## Rendimiento

Objetivo: 60 FPS estables en un PC moderno. Medidas estructurales:

- `devicePixelRatio` limitado a 2.
- Una única luz direccional con sombras (2048) + hemisférica + environment
  map por PMREM (`RoomEnvironment`, sin descarga). Sin postprocesado.
- Pools fijos round-robin: 32 proyectiles/trazadoras, 96 bullet holes,
  24 casquillos, 16 chispas, 10 puffs de humo. Nada se acumula.
- Sin allocations en el loop: vectores temporales reutilizados, arrays de
  raycast persistentes, cola de eventos del arma drenada sin copiar.
  (Excepción conocida: los `Intersection` internos del `Raycaster` por
  impacto, de vida corta y volumen mínimo).
- Assets ligeros: GLBs de 59–131 KB (1.1k–1.9k tris), texturas JPG 1K.
  Total descargable ≈ 6.5 MB (de los cuales ~6 MB son texturas de entorno).
- HUD en DOM que solo escribe cuando el valor cambia.
- `dt` clampado a 50 ms.
- **Debug de rendimiento**: arranca con `?debug` para ver FPS, draw calls,
  triángulos, geometrías y texturas (`renderer.info`) en pantalla.

## Tests

Los tests cubren la lógica determinista: cadencia de fuego, semi/auto,
munición y recarga, ciclo de cerrojo, cambio de modo, ADS, bloom, acumulación
y recuperación de recoil, integración balística contra solución analítica y
estadísticas. No se testea WebGL.

```bash
npm run test
```

## Limitaciones conocidas / trabajo futuro

- La M60 sigue siendo procedural (no hay LMG CC0 adecuada en fuentes
  verificables); los GLB de Quaternius son low-poly estilizado (~1-2k tris):
  siluetas reconocibles y ligeras, pero se pueden reemplazar por modelos
  más detallados con el mismo pipeline (`modelLength`/`modelYaw`/trims).
- La alineación de ADS en GLBs se deriva del bounding box (heurística de
  línea de mira); cada arma tiene trim manual en `view.ads[1]` si hiciera
  falta ajuste fino visual.
- La recuperación de recoil devuelve la cámara al punto original; juegos
  tipo CS usan recuperación parcial. Decisión arcade consciente.
- Sin colisión contra props más allá del clamp de la zona del jugador.
- Los sonidos son sintetizados; sustituir por samples solo requiere tocar
  `AudioSystem`.
- Sin modo multijugador, IA ni puntuación persistente: fuera de alcance.
