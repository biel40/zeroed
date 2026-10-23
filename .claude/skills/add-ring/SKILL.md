---
name: add-ring
description: Anadir un anillo nuevo a Zeroed, el equivalente de las perks o bebidas de CoD Zombies (catalogo, efecto como dato y su hook, maquina en un mapa, mano en primera persona, HUD, i18n, tests y docs). Usar cuando el usuario pida una perk, bebida o anillo nuevo, p. ej. "quiero una perk de recarga rapida" o "anade Vitalidad".
---

# Anadir un anillo (perk) a Zeroed

En Zeroed las perks son anillos: alianzas que los evacuados dejaron en las
taquillas. Cada anillo ocupa un dedo fijo de la mano derecha. Se compra en una
maquina del mapa, se ve en la mano en primera persona y el HUD solo apoya.

Referencia completa: Resurreccion. Archivos:
- `src/game/rings/RingCatalog.ts` y `PlayerRings.ts`;
- `src/modes/ZombiesRings.ts`;
- `src/zombies/maps/station33/RingLocker.ts`;
- los tests `playerRings`, `resurrectionRing` y `ringJingle`.

Lee "Anillos" en `docs/GAME_SYSTEMS.md` y `docs/STATION_33.md`.

## 0. Antes de empezar

- `npm run codemap` y busca con grep en `CODEMAP.md`: `Ring`, `ZombiesRings`, y el sistema
  al que afecta el efecto (`PlayerHealth`, `Weapon`, `PlayerController`...).
- Catalogo previsto (`docs/STATION_33.md`); respetalo salvo que el usuario
  decida otra cosa:

  | Dedo | Anillo | Efecto |
  |---|---|---|
  | anular | Resurreccion | salva una muerte (ya existe) |
  | corazon | Vitalidad | vida maxima |
  | indice | Doble impacto | dano y cadencia |
  | menique | Cadencia | recarga |
  | pulgar | utilidad | p. ej. tercera arma |

  Un dedo, un anillo: no reutilices un dedo ocupado.
- Decide con el usuario si el efecto es:
  - consumible: se gasta al dispararse, como Resurreccion;
  - pasivo: esta activo mientras se lleva y nada llama a `consumeCharge`, asi
    que solo se cobra el primer precio.

## 1. Puntos de contacto

| Archivo | Que anadir |
|---|---|
| `src/game/rings/RingCatalog.ts` | El id en `RingId`, una variante nueva de `RingEffect` (`kind` + parametros con su comentario de unidades) y la entrada en `RING_DEFINITIONS`: `finger`, `nameKey`, `descriptionKey`, `prices` (crecientes, economia de la mansion), `chargesPerPurchase`, `glowColor`. |
| `src/modes/ZombiesRings.ts` | El hook del efecto: un metodo pequeno que el modo consulta (como `tryResurrect`), que lee `RING_DEFINITIONS[ringId].effect` filtrando por su `kind` y llama a `consumeCharge` si es consumible. |
| `src/modes/ZombiesMode.ts` | Una llamada a ese hook en el punto exacto del sistema afectado, sin logica del anillo dentro del modo. |
| `src/i18n/en.ts`, `es.ts`, `ca.ts` | `ring.<id>` (nombre en mayusculas) y `ring.<id>.description`, en los tres idiomas. |
| `src/zombies/maps/<Mapa>Config.ts` | La maquina en el mapa que lo venda (en Station 33, una entrada en `STATION33_RING_LOCKERS`). |
| `docs/GAME_SYSTEMS.md` (Anillos) y `docs/STATION_33.md` | Que hace el anillo, precios y donde se compra; actualiza el catalogo previsto. |

Sin cambios, porque se derivan del catalogo:
- `PlayerRings`: compra, cargas, precios crecientes y dedos;
- `HandRings`: anillo en el dedo y brillo del esmalte;
- el HUD de iconos y la pausa, con nombre, dedo y estado;
- el prompt de compra o recarga, y el jingle de la maquina.

## 2. Reglas

- **Efectos como datos:** el efecto vive en `RingEffect` como dato. Cada
  `kind` tiene un unico hook, y no se anaden condiciones por id en otros sistemas.
- **Color:** el brillo es un acento frio de la paleta (turquesa, azul,
  verde...). El dorado esta reservado a lo premium.
- **Maquinas:**
  - Una maquina es una `ArenaRingMachine`: el mapa solo la presenta con
    `setDisplay('stocked' | 'empty' | 'recharge')` y el modo vende.
  - Un mapa sin `ringMachines` no vende anillos.
  - En Station 33 se reutiliza `RingLocker`, que ya toma el color de `glowColor`.
  - Coloca la taquilla en un banco libre, lejos de entradas, puertas y de la Mystery Box.
- **Solo individual:** el cooperativo no tiene anillos. No los anadas ahi sin
  que el usuario lo pida: haria falta replicarlos en `Protocol.ts` y validarlos
  en el anfitrion.
- **`MOTDRULES` no concede anillos.**
- **Reiniciar la run** quita todos los anillos (`PlayerRings.reset`) y
  restablece el efecto: cualquier estado que anada el hook se limpia en
  `ZombiesRings.reset`.

## 3. Tests y validacion

- `tests/playerRings.test.ts` ya recorre el catalogo: comprueba dedo unico,
  precios crecientes y efecto valido. Ajusta su lista si enumera los ids.
- Crea `tests/<id>Ring.test.ts` siguiendo `tests/resurrectionRing.test.ts`:
  - comprar en la maquina cobra y lo pone en su dedo;
  - el efecto se aplica exactamente donde debe, y no se aplica sin el anillo;
  - consumible: se gasta y la maquina pide recarga;
  - `reset` lo quita todo.
- Si colocas una maquina nueva en Station 33, actualiza las expectativas de
  `tests/station33.test.ts` (taquillas libres de solidos y pasajes).
- `npx tsc --noEmit` y `npx vitest run` (`tests/i18n.test.ts` exige las
  mismas claves en los tres idiomas).
