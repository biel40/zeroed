# Wonder Weapon eléctrica ZEUS-77 (Tesla)

**Qué**: Wonder Weapon eléctrica que se desbloquea a las **100 bajas**. Dispara
un bolt visible; al impactar un zombie lo electrocuta y **encadena** a los
vecinos vivos más cercanos (máx. 10 por disparo, nunca dos veces el mismo).
Daño altísimo (500), munición limitada (3 + 18), recarga estilo celda.

**Por qué**: petición de una Wonder Weapon tipo Wunderwaffe DG-2 con nombre y
diseño propios, integrada con inventario/HUD/recarga, desbloqueo único a 100
kills.

**Dónde**:
- `src/zombies/ZombieConfig.ts` — `TESLA_UNLOCK_KILLS=100`, `CHAIN_MAX_TARGETS`,
  `CHAIN_RADIUS`, `CHAIN_ZAP_DAMAGE` y la función pura `selectChainTargets`
  (salto al vecino vivo más cercano dentro del radio, con `Set` de visitados).
- `src/config/weapons.ts` — definición `tesla` (`energy`, `reserveAmmo`,
  recarga `cell`) + id en `ZOMBIES_WEAPON_PRELOAD`. **NO** está en el pool del
  Mystery Box: es exclusiva del hito.
- `src/weapons/WeaponTypes.ts` — `WeaponId 'tesla'`, `ViewModelConfig.teslaFrame`.
- `src/weapons/WeaponView.ts` — builder `buildTesla` (bobinas de cobre + emisor
  de horquilla + red dot) y precedencia de builders corregida.
- `src/zombies/ZombieManager.ts` — `applyChainLightning` devuelve la cadena en
  orden para que la vista dibuje los arcos.
- `src/zombies/ChainLightning.ts` — arcos en zigzag pooled (TubeGeometry
  aditiva), UNA sola luz compartida.
- `src/audio/AudioSystem.ts` — `playTeslaShot`/`playTeslaChain`/`playTeslaUnlock`.
- `src/modes/ZombiesMode.ts` — `unlockTesla` + rama Tesla en `onEnergyImpact`.

**Aprendido**:
- **Precedencia de builders**: `WeaponView` elige builder por `energyColor`
  antes que por frame. La Tesla tiene AMBOS (`teslaFrame` y `energyColor`), así
  que la comprobación `teslaFrame === 'tesla'` debe ir PRIMERO o se construiría
  un Ray Gun.
- **Distinción de bolt por color**: `onEnergyImpact` diferencia Tesla de Ray
  Gun comparando `config.color`. Frágil si dos armas compartieran color; si se
  añade una tercera energy weapon, conviene un campo `kind` explícito.
- **Orden de hitos**: Tesla (100) < Ray Gun (115). Los tests del Ray Gun matan
  >100 zombies, así que el Tesla se desbloquea primero — los tests se
  actualizaron para filtrar por arma en vez de asumir una única concesión.
- Integración con HUD/inventario/recarga es gratis: el sistema es genérico
  (lee `definition`, `ammoInMagazine`, `reserveAmmo`).
