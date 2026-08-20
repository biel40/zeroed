# Assets — procedencia y licencias

Todos los assets externos son **CC0 (Public Domain)** o equivalente, descargados
de fuentes verificadas y servidos localmente desde `public/assets/`. El juego
no realiza ninguna petición externa en runtime.

## Modelos de armas (`public/assets/weapons/`)

Autor: **Quaternius** — https://quaternius.com (todo su trabajo es CC0).
Descargados de **Poly Pizza** (https://poly.pizza), donde cada página de
modelo indica explícitamente «Public Domain (CC0)»:
https://creativecommons.org/publicdomain/zero/1.0/

| Arma | Modelo | Página | Triángulos | Tamaño |
| --- | --- | --- | --- | --- |
| M4A1 | "Assault Rifle" (AssaultRifle2_1) | https://poly.pizza/m/Bgvuu4CUMV | ~1.9k | 131 KB |
| AK-47 | "Ak47" (AK) | https://poly.pizza/m/em1Hi9GuCv | ~1.1k | 59 KB |
| L96 | "Sniper Rifle" (SniperRifle_3) | https://poly.pizza/m/TKaBjAEofL | ~1.7k | 93 KB |
| M60 | — (builder procedural dedicado `buildM60` en `WeaponView.ts`; no se encontró LMG CC0 adecuada) | — | ~40 meshes | — |
| M1911 | — (modelo procedural detallado bajo `m1911-root` en `WeaponView.ts`; sin GLB CC0 adecuado) | — | primitivas low-poly | — |

Los materiales PBR (metalness/roughness por nombre de material) se ajustan en
tiempo de carga en `src/weapons/WeaponView.ts`. El AK-47 GLB recibe además un
**detail pass procedural anclado a sus bounds** (guardamanos de nogal, gas tube,
varilla de limpieza, freno de boca, alza tangente y cargador curvo "banana") y un
**acabado de armas reales**: acero parkerizado casi negro (metalness alto,
roughness bajo, `envMapIntensity` reforzado) y madera laminada oscura satinada —
el naranja mate original leía como plástico de juguete bajo el env map.

## Modelos de zombies (`public/assets/zombies/`)

Autor: **Quaternius** — https://quaternius.com. Descargados de **Poly Pizza**
(https://poly.pizza). Modelos skinned, rigged y con clips de animación GLTF;
los clips concretos por estado se resuelven por nombre en
`src/zombies/ZombieVisual.ts` (contrato verificado en `tests/zombieAssets.test.ts`).

| Variante | Modelo | Página | Licencia | Triángulos | Clips usados |
| --- | --- | --- | --- | --- | --- |
| `walker` | "Animated Zombie" | https://poly.pizza/m/jkrEvQZb8J | **CC-BY 3.0** (atribución: Quaternius) | ~2.1k | ZombieCrawl (spawn), ZombieWalk, ZombieBite (attack) |

> Solo existe la categoría pequeña (`walker`): la variante grande (`hulk`)
> se eliminó del juego junto con su GLB. No la reintroduzcas sin actualizar
> también el contrato de `tests/zombieAssets.test.ts`.

Notas:

- El `walker` no trae clip de muerte/impacto: cae proceduralmente
  (`ZombieVisual.setDeathProgress`) y el impacto usa flash + crossfade a walk.
- Atribución CC-BY: **Quaternius — "Animated Zombie"**, vía Poly Pizza.
- Variedad por instancia: tinte de piel/ropa, escala ±5 %, walk jitter ±7 %
  (sin cargar modelos adicionales).
- Cargadores, cerrojos y tapas de alimentación de las armas son meshes
  procedurales propios (los GLB de armas de Quaternius son mono-mesh). Sus
  anclas locales pueden declararse por arma; los cargadores soltados se
  reciclan en un pool de 12 (`src/weapons/MagazineDrop.ts`).

## Texturas PBR (`public/assets/textures/`)

Autor: **Poly Haven** — https://polyhaven.com (CC0):
https://polyhaven.com/license

| Textura | Uso | Resolución |
| --- | --- | --- |
| `concrete_{diff,nor,rough}.jpg` | Plataforma, paredes | 1K |
| `brown_planks_03_{diff,nor,rough}.jpg` | Banco, cajas | 1K |
| `metal_plate_{diff,nor,rough}.jpg` | Barreras, estructura metálica | 1K |
| `brown_mud_dry_{diff,nor,rough}.jpg` | Suelo, berm | 1K |

## Environment map

Generado en runtime con `RoomEnvironment` (incluido en three.js, licencia MIT)
+ `PMREMGenerator`. Sin descarga externa.

## Audio (`public/assets/audio/`)

| Archivo | Uso |
| --- | --- |
| `zombies_round_start.mp3` | Sting de inicio de ronda |
| `zombies_background_loop.mp3` | Cama ambiental del menú/pausa de Zombies |
| `mystery_box_open.mp3` | Apertura de la Mystery Box (con fallback procedural) |

### Opcional: pasos de zombie

`src/zombies/ZombieFootsteps.ts` reproduce pasos posicionales 3D. Sin asset usa
un buffer sintetizado en runtime (thump grave + shuffle de ruido, sin base64 ni
dependencias). Para sustituirlo, coloca:

- **Ruta**: `public/assets/audio/zombies/footsteps.mp3`
- **Contenido**: UN solo paso de zombie, seco y corto (~0.2–0.5 s), mono,
  sin silencio largo al inicio. La variación la aporta el motor
  (playbackRate 0.9–1.12 y jitter de cadencia), así que basta un sample.
- **Licencia**: CC0 o equivalente, como el resto de assets; anota aquí la
  fuente cuando lo añadas.

Si el archivo falta o no decodifica, el juego registra un `console.warn` y sigue
con el fallback: la ausencia nunca rompe nada.

## Resto

Muzzle flash, bullet holes, humo, señales de distancia y dianas se generan
proceduralmente en canvas en runtime. Sin assets de terceros.
