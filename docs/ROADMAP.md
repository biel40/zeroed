# Roadmap deducido

Solo incluye trabajo respaldado por defectos, limitaciones o contratos presentes en el repositorio.

## Correcciones de comportamiento

- Impedir que la simulacion avance antes del primer START y detener input de gameplay durante game over.
- Permitir reparar barreras completamente destruidas y cancelar correctamente la reparacion al cambiar arma en tactil.
- Corregir RESTART del campo de tiro y definir un reset completo y verificable para una run Zombies.
- Hacer ilimitada la reserva del campo de tiro sin alterar las reservas finitas de Zombies.
- Corregir distancias de impacto balisticas/energeticas y el fade vertical de zombies fuera de Y=0.
- Conectar la musica de Zombies al ciclo real deseado sin reproducir pistas inactivas al reanudar.

## Consolidacion de contratos

- Identificar proyectiles de energia por arma o tipo de impacto, no por color, antes de agregar otra arma especial.
- Reutilizar las texturas precargadas de `AssetManager` en Burned Mansion.
- Definir propiedad/registro de colliders dinamicos para evitar mutaciones ambiguas del array compartido.
- Incorporar `dispose()` en shell/modos antes de permitir cambios de modo o mapa sin recarga de pagina.
- Alinear los contratos inactivos o ambiguos (`cameraShare`, `acceptsDecals`, `reserveAmmoFor`) con su comportamiento real.

## Validacion y documentacion existente

- Agregar pruebas de integracion del arranque, pausa/reinicio, game over, spawn con pool ocupado, reparacion total y distancia de impacto.
- Mantener `README.md`, `ASSETS.md` y el indice de `docs/changes/` alineados con los dos modos, siete armas y assets de audio actuales.
- Documentar procedencia/licencia de los MP3 y resolver la afirmacion incompatible de que todos los assets externos son CC0 frente al zombie CC-BY 3.0.

## Distribucion

- Empaquetar el build Vite como aplicacion Android mediante Capacitor, manteniendo la PWA y la web de `zeroed.es` como canales independientes.
