# Assets — procedencia y licencias

Los assets externos se sirven localmente desde `public/assets/`, con su licencia
indicada en cada seccion. Predomina **CC0 (Public Domain)**; el walker original
y Brutus, derivado de el, usan **CC-BY 3.0** y exigen atribucion a Quaternius.
Esa atribucion (titulo, autor, enlace y licencia) se muestra siempre en el menu
principal y en los creditos finales (`index.html`); no la retires mientras se
usen esos modelos. El juego no realiza ninguna peticion externa en runtime.

## Modelos de armas (`public/assets/weapons/`)

Autor: **Quaternius** — https://quaternius.com (todo su trabajo es CC0).
Descargados de **Poly Pizza** (https://poly.pizza), donde cada página de
modelo indica explícitamente «Public Domain (CC0)»:
https://creativecommons.org/publicdomain/zero/1.0/

| Arma | Modelo | Página | Triángulos | Tamaño |
| --- | --- | --- | --- | --- |
| M4A1 | Builder procedural dedicado `buildM4A1` en `src/weapons/M4A1ViewModel.ts` | Original del proyecto | 1984 | Sin descarga |
| L96 | Builder procedural dedicado `buildL96` (frame `'l96'`) en `src/weapons/L96ViewModel.ts` | Original del proyecto | ~4.5k | Sin descarga |
| AK-47 | Builder procedural dedicado `buildAk47` (frame `'ak47'`) en `src/weapons/AK47ViewModel.ts` | Original del proyecto | ~5.7k | Sin descarga |
| M60 | Builder procedural dedicado `buildM60` (frame `'lmg'`) en `src/weapons/M60ViewModel.ts` | Original del proyecto | ~7.2k | Sin descarga |
| M1911 | — (modelo procedural detallado bajo `m1911-root` en `WeaponView.ts`; sin GLB CC0 adecuado) | — | primitivas low-poly | — |
| Ray Gun | Builder procedural dedicado `buildRayGun` en `src/weapons/RayGunViewModel.ts` | Original del proyecto | ~7k | Sin descarga |

El GLB anterior de la M4A1, "Assault Rifle" (AssaultRifle2_1) de Quaternius
(https://poly.pizza/m/Bgvuu4CUMV, CC0, 131 KB), se conserva en el repositorio
pero ya no se carga. El modelo procedural separa cuerpo y cargador para la recarga.
Lo mismo ocurre con el GLB "Sniper Rifle" (SniperRifle_3) de la L96
(https://poly.pizza/m/TKaBjAEofL, CC0, 93 KB): la L96A1 procedural reproduce la
culata thumbhole verde oliva, la acción con raíl, el visor 6x42, el cargador
extraíble, el bípode plegado y un cerrojo que gira sobre el eje del ánima. Sus
perfiles laterales (`L96_PROFILE`) también trazan la silueta de su wall buy.

Los materiales PBR (metalness/roughness por nombre de material) se ajustan en
tiempo de carga en `src/weapons/WeaponView.ts`. La AK-47 Tipo 3 es íntegramente
procedural y sus perfiles (`AK47_PROFILE`) se trazaron sobre una foto de
referencia a ~1 mm/px (880 mm totales). Reproduce el receptor fresado con sus
rebajes, la tapa redondeada, el alza tangente con muesca en U, el tubo de gases,
el guardamanos de dos piezas, el punto de mira con orejetas, la baqueta y el
cargador curvo sobre un arco. La madera usa veta procedural y barniz
(`clearcoat`); el acero, una textura de microdesgaste. Ambas se generan en
canvas en runtime, sin descargas. Los mismos perfiles trazan su wall buy.

La M60 sigue la misma estrategia: sus perfiles (`M60_PROFILE`) se trazaron
sobre una foto de referencia a 0,76 mm/px (1105 mm totales). Reproduce la
culata con estrías, el receptor con la ranura de la palanca de carga, la tapa
de alimentación con bisagra delantera, el alza levantada con apertura, el
guardamanos nervado bajo el escudo térmico ranurado, el cilindro de gases, el
punto de mira triangular, el apagallamas de cuatro patas, el bípode plegado y
la bolsa de 100 cartuchos con la cinta. Su wall buy usa los mismos perfiles con
el bípode desplegado, como en la foto.

La Ray Gun procedural combina carcasas de esmalte rojo desconchado, ventanas
de plasma con un mapa emisivo que fluye, discos aceleradores, tres brazos con
puas y una mira tubular abierta por la que se apunta. Pintura, desgaste y
plasma se dibujan en canvas en runtime (`ProceduralTextures.ts`); su disparo e
impacto son sintesis Web Audio propia, distinta del zap de la ZEUS-77.

## Brazos en primera persona (procedurales)

Los brazos del viewmodel son geometria propia, sin descargas: manga y montaje
en `src/weapons/FirstPersonArm.ts`, esqueleto en `ArmRig.ts`, mano en
`HandModel.ts` y piel en `HandSkinTexture.ts`. Cada brazo es un `SkinnedMesh`
con 18 huesos: hombro, codo, muneca y tres falanges por dedo (dos mas el
metacarpiano en el pulgar). Manga y mano comparten esqueleto, asi que cada
brazo cuesta tres draw calls (manga, sombra de tela y piel con uñas).

- **Aspecto**: manga de la chaqueta de campo de `soldier.glb` sobre una mano
  desnuda de proporciones adultas. Antebrazo, muneca y palma son una sola
  superficie (nudillos, eminencias tenar e hipotenar) y cada dedo un tubo
  continuo que se dobla en sus articulaciones, con almohadillas y uña. La piel
  es un atlas horneado en codigo (color, relieve y rugosidad): pliegues de
  nudillos y muneca, lineas de la palma, venas suaves, yemas y uñas.
- **Densidad**: escritorio ~3,3k triangulos por brazo y piel de 512 px; movil
  ~1,6k y bajo memoria ~1,4k, con piel de 256 px. El esqueleto es el mismo en
  los tres niveles.
- **Poses**: los agarres son datos (`src/weapons/HandPoses.ts`); los puntos de
  agarre de cada arma viven en `view.hands` de `src/config/weapons.ts`.

## Modelos de zombies (`public/assets/zombies/`)

El walker vuelve al asset original de **Quaternius**, via **Poly Pizza**,
ya incluido en el proyecto, con una unica modificacion: la celda de piel de su
paleta pasa del verde original a un gris cadaverico (`#b0b0b6`). Brutus se
genera localmente a partir de ese walker y hereda ese color.
Los clips concretos por estado se resuelven por nombre en
`src/zombies/ZombieVisual.ts` (contrato verificado en `tests/zombieAssets.test.ts`).

| Variante | Modelo | Página | Licencia | Triángulos | Clips usados |
| --- | --- | --- | --- | --- | --- |
| `walker` | "Animated Zombie" | https://poly.pizza/m/jkrEvQZb8J | **CC-BY 3.0**, atribucion: Quaternius | 2116 | ZombieCrawl, ZombieIdle, ZombieWalk, ZombieRun |
| `brute` | "Zeroed Brutus", derivado de "Animated Zombie" (`scripts/generate-brute-asset.mjs`) | https://poly.pizza/m/jkrEvQZb8J | **CC-BY 3.0**, atribucion: Quaternius (obra derivada) | 2614 | BruteRise, BruteWalk |

> `normal` y `shiny` comparten el walker; `brute` usa su propio GLB y pool,
> pero hereda del walker esqueleto, paleta, cara y clips de locomocion. El
> registro separa tipos de gameplay y modelos para que futuros tipos puedan
> compartir un asset o reservar otro independiente.

Notas:

- Los ataques al jugador y a barreras se resuelven proceduralmente sobre una
  base quieta para compartir contacto, variantes y limites anatomicos entre
  rigs. El `walker` no trae clip de muerte/impacto: cae proceduralmente y los
  impactos usan flash y una reaccion direccional aditiva.
- Cada modelo tiene un unico tinte base. Normal conserva la textura original;
  Shiny es dorado, emisivo y tiene diez estrellas animadas. No se sortean colores.
- El walker conserva su rig, textura y clips originales: un material y 694500
  bytes. Las estrellas usan una textura procedural compartida de 32x32 y una
  llamada de dibujo adicional por Shiny, sin luces ni assets externos nuevos.
- Brutus mide 2.30 m y es el walker reconstruido como bestia: el generador
  reescala huesos y malla (torso, hombros, antebrazos y puños enormes, cuello
  hundido), arranca mangas y pecho de la camisa, añade grilletes de hierro,
  espolones de hueso y una postura encorvada sobre ZombieCrawl/ZombieWalk.
  Las piezas nuevas usan celdas añadidas a la paleta del walker y se fusionan
  en la misma malla con skin: un material y una llamada de dibujo. Solo su GLB
  se regenera con `npm run generate:zombie-brute`.
- Cargadores, cerrojos y tapas de alimentación de las armas son meshes
  procedurales propios (los GLB de armas de Quaternius son mono-mesh). Sus
  anclas locales pueden declararse por arma; los cargadores soltados se
  reciclan en un pool de 12 (`src/weapons/MagazineDrop.ts`).

## Compañero cooperativo (`public/assets/players/`)

El jugador remoto usa `soldier.glb`, un personaje original del proyecto generado
por `scripts/generate-soldier-asset.mjs` (`npm run generate:player`). No descarga
materiales externos. Si falta el GLB, `createRemoteAvatar()` conserva el cuerpo
procedural de reserva.

- **Ruta**: `public/assets/players/soldier.glb` (se carga solo al abrir el
  lobby cooperativo; el modo individual nunca lo pide).
- **Contenido**: superviviente militar genérico con prendas oscuras, casco,
  mochila, correaje, guantes, botas y un fusil compacto de reserva sin marcas. El rostro
  modelado conserva ojos, nariz y mandíbula visibles sobre una máscara ajustada.
  Diseño original sin insignias ni marcas.
- **Rig**: 16 articulaciones; chaqueta, mangas y pantalones usan `SkinnedMesh`;
  las piezas menores siguen los mismos huesos. Origen en los pies, mirando a
  +Z (norma glTF). La altura se normaliza a 1,80 m; `Spine` recibe la
  inclinación de la mirada.
- **Agarre**: ambos brazos se resuelven contra la empuñadura y el guardamanos.
  El grupo `teammate-rifle` fija el agarre del torso; el render remoto oculta
  sus mallas y monta el modelo del arma equipada usando su ID de red. Solo
  vuelve a mostrar el fusil de reserva si no puede resolver ese ID. Los modelos
  sustituidos se separan de la escena y se reutilizan al volver a equiparlos.
- **Clips** (por nombre, sin distinguir mayúsculas): obligatorios `Idle` y
  `Walk`, `CrouchIdle`, `CrouchWalk`, `ProneIdle` y `ProneCrawl`; opcionales
  `Run`, `Aim`, `Fire`/`Shoot`, `Reload`, `Death`. `Aim`, `Fire` y `Reload`
  se filtran a huesos de torso/brazos y se aplican como capas aditivas sobre
  la postura y locomocion. Un modelo sin clips de postura usa el cuerpo de reserva.
- **Coste**: ~6k triángulos, 59 meshes, 16 materiales y ~314 KiB.
  La textura de desgaste está embebida. Se carga solo al abrir el lobby
  cooperativo. Los clips y geometría son originales.

### Ruta alternativa: construir desde Mixamo

1. En https://www.mixamo.com → *Characters*, elige el soldado. Descárgalo con
   *Format* `FBX Binary (.fbx)`, *Pose* `T-pose` → `character.fbx`.
2. Con ese personaje seleccionado, en *Animations* descarga cada clip con
   *Format* `FBX Binary`, *Skin* `Without Skin`, *Frames per Second* `30` y
   **In Place** marcado cuando exista. Nombres de archivo: `idle.fbx`,
   `walk.fbx`, `crouch-idle.fbx`, `crouch-walk.fbx`, `prone-idle.fbx`,
   `prone-crawl.fbx` (obligatorios), `run.fbx`, `aim.fbx`, `fire.fbx`, `reload.fbx`,
   `death.fbx` (opcionales). Busca las versiones de pistola (M1911).
3. Copia los FBX en `assets/players/mixamo/` y ejecuta
   `npm run build:player-asset`. El script convierte con FBX2glTF, une los clips
   en un solo esqueleto, bloquea el desplazamiento horizontal de la cadera y
   escribe `public/assets/players/soldier.glb`.

## Texturas PBR (`public/assets/textures/`)

Autor: **Poly Haven** — https://polyhaven.com (CC0):
https://polyhaven.com/license

| Textura | Uso | Resolución |
| --- | --- | --- |
| `concrete_{diff,nor,rough}.jpg` | Suelos, paredes y techos de Burned Mansion | 1K |
| `brown_planks_03_{diff,nor,rough}.jpg` | Burned Mansion y Mystery Box | 1K |
| `metal_plate_{diff,nor,rough}.jpg` | Mystery Box | 1K |

## Environment map

Generado en runtime con `RoomEnvironment` (incluido en three.js, licencia MIT)
+ `PMREMGenerator`. Sin descarga externa.

## Audio (`public/assets/audio/`)

| Archivo | Uso |
| --- | --- |
| `zombies_round_start.mp3` | Sting de inicio de ronda |
| `menu_theme.mp3` | Música en bucle del menú principal y de pausa |
| `background_music_theme.mp3` | Música en bucle durante la partida en Burned Mansion |
| `station33_theme.mp3` | Música en bucle durante la partida en Station 33 |
| `mystery_box_open.mp3` | Apertura de la Mystery Box (con fallback procedural) |
| `encasquillada_arma.mp3` | Disparo en seco de un arma sin munición (con fallback procedural) |
| `door_purchase.mp3` | Compra de una puerta por Points (con fallback procedural) |
| `zombies/footsteps.mp3` | Paso de zombie posicional 3D (con fallback procedural) |
| `misterio-halloween-theme-2-256014-license.txt` | Certificado de licencia de `menu_theme.mp3` |

### Música de Station 33

**«Creepy Halloween Music» — Tunetank**, publicada en
[Pixabay](https://pixabay.com/music/ambient-creepy-halloween-music-413493/).
Archivo: `station33_theme.mp3`, copiado del MP3 descargado por el usuario sin
modificar el audio. Uso bajo la
[Pixabay Content License](https://pixabay.com/service/license-summary/).
La ficha indica **Content ID Registered**. Esta referencia documenta el origen;
no sustituye un certificado de descarga de Pixabay.
El crédito aparece en el menú principal y en los créditos finales.

### Efectos de Kenney (CC0)

Autor: **Kenney** — https://kenney.nl (CC0):
https://creativecommons.org/publicdomain/zero/1.0/

| Archivo | Origen | Procesado |
| --- | --- | --- |
| `zombies/footsteps.mp3` | *Impact Sounds*, `footstep_concrete_000.ogg` | Mono, tono al 85 % (más grave), sin silencio inicial, pico −2 dB |
| `door_purchase.mp3` | *RPG Audio*, `handleCoins.ogg` + `doorOpen_1.ogg` (+180 ms) | Mezcla mono, pico −2 dB |

`src/zombies/ZombieFootsteps.ts` reproduce el paso como UN sample corto; la
variación la aporta el motor (playbackRate 0.9–1.12 y jitter de cadencia).
Si un archivo falta o no decodifica, ambos sonidos vuelven a su síntesis
procedural.

## Resto

Muzzle flash, bullet holes, humo, señales de distancia y dianas se generan
proceduralmente en canvas en runtime. Sin assets de terceros.
