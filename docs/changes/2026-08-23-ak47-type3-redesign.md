# Rediseño visual de la AK-47 (Tipo 3 procedural)

**Qué**: la AK-47 deja de ser el GLB de Quaternius + detail pass y pasa a un
builder procedural dedicado (`buildAk47`, frame `'ak47'`) con culata fija de
madera, guardamanos de dos piezas sobre un gas tube visible, cañón largo con
poste protegido, alza tangente y cargador banana 7.62 de curvatura marcada.
La silueta de compra de pared tiene perfil AK dedicado.

**Por qué**: el GLB (1122 tris) leía como híbrido AKS-74U/AK-47: receiver
excesivamente en bloque, cañón corto, culata como prisma marrón y cargador
poco curvado. La silueta no se reconocía como AK-47 clásica.

**Dónde**:
- `src/weapons/WeaponView.ts` — nuevo `buildAk47`; dispatch en
  `buildProceduralViewModel`; eliminados `buildAk47Details`,
  `buildAk47Magazine`, `GlbDetailPass` y las ramas GLB de la AK.
- `src/config/weapons.ts` — `frame: 'ak47'`, `optic: 'irons'`, sin
  `modelUrl`/`modelYaw`/`modelLength`; madera rojiza `0x74411f`.
- `src/zombies/wallbuys/WallBuyView.ts` — silueta dedicada (`'ak47'`).
- `tests/ak47View.test.ts` — sustituye a `ak47Details`/`ak47Magazine`.
- `public/assets/weapons/ak47/model.glb` — eliminado; `ASSETS.md` al día.

**Aprendido**:
- Culata y grip se extruyen desde perfiles 2D (`THREE.Shape` + `rotateY(π/2)`,
  shape +X → world −Z): la silueta lateral queda exacta, no una caja rotada.
- Los segmentos del cargador usan `rotation.x` POSITIVA para barrer hacia el
  frente (−Z); el builder anterior los inclinaba al revés (el test antiguo
  solo comprobaba posiciones, no orientaciones).
- `RoundedBoxGeometry` produce bounds efectivos menores que lo pedido: las
  uniones receiver↔guardamanos necesitan solape extra para no quedar a 1 mm
  de separación (lo cubre el test "no floating pieces").
- Al quitar `modelUrl`, TODAS las representaciones (primera persona, Mystery
  Box, pickups, viewer) caen automáticamente al mismo builder procedural.
