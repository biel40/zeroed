---
name: add-weapon
description: Anadir un arma de fuego nueva a Zeroed (definicion, modelo procedural en primera persona, silueta de wall buy, Mystery Box, wall buy en un mapa y tests). Usar cuando el usuario pida una arma nueva, p. ej. "anade la MP5" o "quiero el Galil en la caja y en pared".
---

# Anadir un arma a Zeroed

Referencia completa: la MP5 (`src/weapons/MP5ViewModel.ts`, `tests/mp5View.test.ts`).
Sigue AGENTS.md; ningun modo depende de un arma concreta.

## 1. Investigar

- `npm run codemap` y busca con grep en `CODEMAP.md` los archivos de la tabla
  del paso 2, en lugar de explorar el repo.
- Busca en internet las especificaciones reales: calibre, cadencia (rpm),
  capacidad, velocidad de boca, longitud total, longitud de cañon y variante.
- Si el usuario adjunta una foto, usala para trazar el perfil lateral: mide en
  pixeles y escala a la longitud real (mm por pixel). Anota los puntos clave
  (culata, receptor, empuñadura, guardamonte, cargador, guardamanos, miras,
  cañon) en coordenadas [z, y]: -Z hacia la boca, y = 0.01 eje del anima.

## 2. Puntos de contacto (todos obligatorios)

| Archivo | Que anadir |
|---|---|
| `src/weapons/WeaponTypes.ts` | El id en `WeaponId` y el valor en `ViewModelConfig.frame` (con su linea en el comentario). |
| `src/config/weapons.ts` | La `WeaponDefinition` (comentario breve: arma real y papel de juego), el id en `WEAPON_ORDER` y en `ZOMBIES_WEAPON_PRELOAD`. Si es automatica, su `heat` (ver 3b). |
| `src/weapons/<Arma>ViewModel.ts` | `<ARMA>_PROFILE` exportado + `build<Arma>(config)`. |
| `src/weapons/WeaponView.ts` | Import y rama en `buildProceduralViewModel`. |
| `src/zombies/wallbuys/WallBuyView.ts` | Rama en el constructor + `build<Arma>Silhouette` trazada desde el mismo `<ARMA>_PROFILE`. |
| `src/zombies/MysteryBox.ts` | Entrada en `MYSTERY_BOX_POOL` (estandar 20-25; las Wonder Weapons son raras/legendarias). |
| `src/zombies/ZombieConfig.ts` | Reserva en `ZOMBIES_RESERVE_AMMO`. |
| `src/zombies/ZombieDeath.ts` | Estilo de muerte en `WEAPON_DEATH_STYLES` (automaticas: `riddled`; potentes semiautomaticas: `knockback`). |
| `src/rendering/RemotePlayerAvatar.ts` | Longitud del modelo del companero si no mide ~0.84 m. |
| `src/zombies/maps/<Mapa>Config.ts` | `WallBuyConfig` si el usuario quiere compra de pared (ver 4). |

Protocolo de red, inventario cooperativo, `ShotValidator` y precarga del
Mystery Box se derivan de `WEAPON_DEFINITIONS`/`ZOMBIES_WEAPON_PRELOAD`: no
tocar.

## 3. Modelo procedural

- Copia la estructura de `MP5ViewModel.ts` / `L96ViewModel.ts`: helpers
  `add`/`assembly`, `ProfileGeometry` (`profileShape`, `extrudeProfile`,
  `cylinderZ`), un `assembly` por pieza animable o por grupo de materiales y
  `mergeAssemblies(group)` al final.
- Presupuesto: <= 24 meshes tras el merge y pocas miles de caras.
- Partes de recarga: `reloadParts.magazine` y `reloadParts.handle` (palanca
  de carga o cerrojo). Estilos de recarga en `ReloadStyle`.
- Balas del cargador: `reloadParts.rounds` con `buildMagazineRounds` y el
  calibre de `CARTRIDGES` (`MagazineRounds`), sobre la boca del cargador
  (`feedLipSeats`). Solo se dibujan con el cargador fuera; los estilos `rifle`,
  `rock`, `drum` y `pistol` lo sacan tambien al inspeccionar (F).
- Miras: la linea de mira es `sightHeight`; ninguna pieza puede taparla
  (alzas con hueco, tambor/base por debajo). La mano de apoyo y los dedos
  nunca cubren las miras.
- Manos: reutiliza la seccion y el angulo de una empuñadura existente (la MP5
  copia la del M4A1 desplazada en y) para que los tests de dedos pasen sin
  ajuste fino. `hold.size` describe la pieza sujeta real.
- Mano de apoyo segun el arma:
  - guardamanos horizontal y bajo: `supportHandguard`, como M4A1, AK-47 o MP5;
  - brocal ancho o pieza vertical: `supportMagwell`, como la Vector, con la
    palma en el flanco izquierdo (`palm: [1, 0, 0]`);
  - un bloque alto y corto en la boca no se sujeta bien con `supportHandguard`.
- Los tests de manos miden contra el prisma `hold`, no contra la malla: un
  pulgar puede atravesar el arma y pasar igual. Comprueba las puntas de los
  huesos de la mano contra la malla con raycast en un test temporal y
  borralo al terminar.
- Un pulgar nuevo va girado sobre su eje (Z de `thumb.base`): la yema sobre la
  pieza y la uña hacia fuera, visible desde la camara (lo comprueba el test
  "both thumbs lie on their side"). Una pose lejos del `THUMB_REST` de su mano
  deforma la base del pulgar.
- Colores: `bodyColor` (metal) y `accentColor` (polimero/madera) en la definicion.

## 3b. Recalentamiento (obligatorio en automaticas)

Toda arma con `'auto'` en `fireModes` lleva `heat: BarrelHeatConfig`; las
semiautomaticas y de energia no (lo exige `tests/barrelHeat.test.ts`). Con el
dato basta: `BarrelHeat` (en `Weapon`) suma la dispersion, `BarrelGlow` pinta
la punta del cañon de rojo a naranja y `BarrelSmoke` (en `Game`) anade humo.
No hay que tocar el modelo.

- Es deliberadamente poco realista: debe verse pronto. El brillo aparece al
  35 % de `shotsToOverheat` y tiene que asomar en menos de 1.5 s de fuego
  continuo (lo exige el test).
- `shotsToOverheat`: ~20-25 en cargadores de 30 (mas bajo cuanto menor la
  cadencia); PPSh-41 40, M60 30.
- `coolTime`: 4.5-6 s de caliente a frio (mas en armas pesadas).
- `maxSpreadBonus`: 0.012-0.016 rad, un poco por debajo del `maxBloom`.
- El brillo se coloca en el ancla de la boca y por defecto envuelve un cañon
  de `view.barrelRadius`. Si el cañon queda oculto en una camisa, funda o
  guardamanos que llega a la boca (PPSh-41), fija `heat.glow` (radio y
  longitud en metros) para envolver esa pieza, sin llegar a `sightHeight`.

## 4. Wall buy

- Precios de referencia: subfusil 1000 / 500, carabina 1500 / 750, fusil
  1750 / 900, ametralladora y francotirador segun mansion.
- Coloca la silueta a 2 cm de la cara del muro (`yaw` hacia la sala), lejos
  de decals, carteles, puertas y taquillas; revisa los `*Dressing.ts` del mapa.
- Actualiza la lista esperada de wall buys en el test del mapa
  (`tests/station33.test.ts`, `tests/burnedMansion.test.ts`).

## 5. Tests y validacion

- Crea `tests/<arma>View.test.ts` siguiendo `tests/mp5View.test.ts`:
  definicion, caja + wall buy, dimensiones/presupuesto del modelo, linea de
  mira libre (raycast), recarga y silueta.
- `tests/barrelHeat.test.ts` comprueba que cada automatica tenga `heat` y
  ninguna otra; si el arma es semiautomatica sin energia, anadela a la lista
  "no barrel glow" de ese test.
- `tests/firstPersonArms.test.ts` recorre todas las armas automaticamente
  (manos, codos, munecas, dedos, miras): debe pasar sin excepciones.
- Anade el id a `STANDARD_FIREARMS` de `tests/headshotRewards.test.ts` y al
  pool esperado de `tests/mysteryBox.test.ts` (la matematica de `pickWeighted`
  usa una rueda fija y no cambia).
- `npx tsc --noEmit` y `npx vitest run`.
- Documenta en `docs/GAME_SYSTEMS.md` / `docs/STATION_33.md` solo si cambia
  el contenido de un mapa (que arma hay en pared y a que precio).
