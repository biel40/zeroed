# Roadmap previo a v1.0

Solo incluye trabajo respaldado por bugs, limitaciones o contratos presentes.

## Cooperativo despues del primer corte

- Validar dos navegadores reales con Pointer Lock y latencia; comprobar
  movimiento, disparos, pausas, muerte, reinicio y desconexion.
- Completar reglas compartidas de compras, cuchillo, Mystery Box, bunker y
  secretos de Burned Mansion sin alterar la ruta individual offline.
- Evaluar reconciliacion de movimiento, proyectiles equivalentes entre ambos
  jugadores y reconexion antes de ampliar salas o distribuir en Android.

## Correcciones de comportamiento

- Bloquear simulacion antes de START y input de gameplay durante game over.
- Reparar barreras totalmente destruidas; cancelar reparacion al cambiar arma
  en tactil.
- Hacer verificable RESTART completo para individual y cooperativo.
- Corregir distancias de impacto y fade vertical de cadaveres.
- Conectar musica al ciclo real sin pistas inactivas al reanudar.

## Contratos y arquitectura

- Identificar energia por arma/tipo, no por color.
- Reutilizar texturas precargadas y registrar colliders dinamicos.
- Alinear `cameraShare`, `acceptsDecals` y `reserveAmmoFor` con su uso real.

## Validacion y distribucion

- Añadir integracion de arranque, pausa/reinicio, game over, pool ocupado,
  reparacion total y distancia de impacto.
- Alinear README, ASSETS y esta documentacion con siete armas y audio actual.
- Documentar procedencia/licencia de MP3 y corregir la afirmacion de que todos
  los externos son CC0 frente al walker CC-BY 3.0.
- Validar build Vite, PWA/offline y empaquetado Android con Capacitor.
- Retirar o blindar god mode y revisar casos de navegacion no deterministas.
