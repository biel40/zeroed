# Identidad visual de la M1911

**Que**: la M1911 usa una pose de camara mas proporcionada, acabado parkerizado oscuro y estrias laterales discretas; su Wall Buy tiene una silueta especifica de pistola con corredera, empunadura, guardamonte, martillo y miras.

**Por que**: el modelo aparecia sobredimensionado y sus estrias parecian bloques sobre la mira, mientras la plantilla generica del Wall Buy convertia la pistola en un fusil largo.

**Donde**: `src/config/weapons.ts`, `src/weapons/WeaponView.ts`, `src/zombies/wallbuys/WallBuyView.ts`, `tests/m1911View.test.ts`.

**Aprendido**: la M1911 ya tenia un constructor procedural dedicado y animaciones propias. La solucion mantiene esos contratos y especializa unicamente su presentacion; no modifica estadisticas de gameplay.
