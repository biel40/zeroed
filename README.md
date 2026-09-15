# Zeroed - Browser Zombies FPS

Un FPS Zombies de navegador construido con Three.js y TypeScript. Desarrollado con el amor y el cariño de un viejo y clásico jugador de los Call of Duty Zombies clásicos.

## Tecnologías utilizadas

- **TypeScript**
- **Three.js**
- **Vite**
- **Vitest** 
- **Web Audio API**

## Instalación y ejecución

```bash
npm install
npm run dev
```

## Controles

| Entrada | Acción |
| --- | --- |
| `WASD` | Movimiento |
| Ratón | Cámara |
| `LMB` | Disparar |
| `RMB` | Apuntar (ADS) |
| `R` | Recargar |
| `X` | Cambiar modo de fuego (M4A1 / AK-47) |
| `1` `2` | Slots de arma |
| `E` | Interactuar / comprar / abrir puertas |
| `Space` | Saltar |
| `ESC` | Liberar el puntero |


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

### Añadir un arma nueva

1. Añade su `WeaponId` en `src/weapons/WeaponTypes.ts`.
2. Añade su `WeaponDefinition` en `src/config/weapons.ts` y su id a
   `WEAPON_ORDER` (la posición define la tecla 1-4).
3. Opcionalmente ajusta `view` (colores, cargador, óptica) para el placeholder
   procedural.

## Tests

Los tests cubren la lógica determinista: cadencia de fuego, semi/auto,
munición y recarga, ciclo de cerrojo, cambio de modo, ADS, bloom, acumulación
y recuperación de recoil, integración balística contra solución analítica y
estadísticas. No se testea WebGL.

```bash
npm run test
```

## Limitaciones conocidas
- Sin modo multijugador, IA ni puntuación persistente: fuera de alcance inicial del proyecto.
