# Rediseño del HUD de salud Zombies

**Que**: se elimina el valor numerico de HP y se conserva la barra de salud dentro de un panel Zombies rediseñado con silueta irregular, capas oscuras, desgaste visual y acentos rojo sangre.

**Por que**: reducir ruido visual y acercar el HUD a una estetica de horror militar sin perder la lectura inmediata de salud, ronda, puntos y bajas.

**Donde**: `index.html`, `src/ui/HUD.ts`, `src/style.css` y `tests/mobileLayout.test.ts`.

**Aprendido**: el selector movil del panel necesita sobrescribir explicitamente el padding especializado de `#hud-zombies`; la regla generica de `.hud-panel` no gana contra un ID.
