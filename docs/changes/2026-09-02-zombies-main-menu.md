# Menu principal Zombies

**Que**: `ZEROED` pasa a encabezar un menu oscuro de survival con `PLAY ZOMBIES` como CTA unico; el catalogo mantiene Classic/Shooting Range soportado pero con `visible: false`.

**Por que**: la entrada publica debe comunicar inmediatamente la identidad zombie y dejar la exposicion futura de mapas separada de su implementacion.

**Donde**: `index.html`, `src/config/zombieMaps.ts`, `src/main.ts`, `src/ui/HUD.ts`, `src/modes/ZombiesMode.ts`, `src/style.css`, `tests/mapSelection.test.ts`.

**Aprendido**: ocultar una opcion publica no equivale a retirar su soporte; `ShootingRange` sigue siendo infraestructura usada por `ClassicArena`.
