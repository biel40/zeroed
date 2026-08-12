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
| M60 | — (placeholder procedural mejorado; no se encontró LMG CC0 adecuada) | — | — | — |

Los materiales PBR (metalness/roughness por nombre de material) se ajustan en
tiempo de carga en `src/weapons/WeaponView.ts`.

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

## Resto

Muzzle flash, bullet holes, humo, señales de distancia y dianas se generan
proceduralmente en canvas en runtime. Sin assets de terceros.
