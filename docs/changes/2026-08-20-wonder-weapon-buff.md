# Buff de Wonder Weapons (Ray Gun y ZEUS-77)

**Qué**: Ray Gun: splash 100 → 150 y radio 2.5 → 3.5 (daño directo intacto en
150). ZEUS-77: `CHAIN_ZAP_DAMAGE` 500 → 750, `CHAIN_RADIUS` 6 → 9 y
`CHAIN_MAX_TARGETS` 10 → 20; el daño base del arma (`tesla.damage`) sube a 750
para mantener el contrato `damage >= CHAIN_ZAP_DAMAGE`.

**Por qué**: las Wonder Weapons debían quedar claramente por encima de las armas
convencionales (`normales < Ray Gun << ZEUS`) y sentirse decisivas contra
hordas compactas.

**Dónde**:
- `src/config/weapons.ts` — `energy` del Ray Gun y `damage` de la Tesla.
- `src/zombies/ZombieConfig.ts` — constantes `CHAIN_*` (fuente única de verdad).
- `src/zombies/ChainLightning.ts` — `MAX_CHAINS` ahora se DERIVA de
  `CHAIN_MAX_TARGETS`: con el tope en 20, el pool de 10 arcos habría truncado
  visualmente la mitad de la cadena.
- `tests/teslaChain.test.ts` — contrato actualizado a 20 objetivos.

**Aprendido**:
- El falloff lineal del splash (`splashDamageAt`) no cambia: subir radio y daño
  base amplía el área letal conservando máximo en el epicentro y cero en el borde.
- Coste del buff ≈ cero: `selectChainTargets` es O(20 × 24) distancias al
  cuadrado por disparo y el splash ya iteraba todos los activos (24) con radio
  independiente del coste; los 10 arcos extra son Tubes de ~144 triángulos.
- La restricción anti-cadenas-absurdas se mantiene: salto al vecino MÁS CERCANO
  dentro de 9 m, set de visitados y mismo piso (`applyChainLightning`).
