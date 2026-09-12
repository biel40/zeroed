# Ventanas adicionales y arranque de tablas

**Que**: Burned Mansion pasa de siete a nueve ventanas. Cada golpe zombie destruye exactamente una de sus cinco tablas. La rotura combina agarre, extraccion hacia el exterior, elevacion, giro y caida; el zombie carga el peso hacia delante y tira hacia atras tras el contacto.

**Por que**: las tablas necesitaban dos golpes y su animacion las empujaba hacia dentro del edificio, por lo que el ataque no parecia arrancarlas. El impacto de madera generico tambien resultaba demasiado presente para una accion repetida.

**Donde**: `src/zombies/ZombieConfig.ts`, `src/zombies/ZombieVisual.ts`, `src/zombies/barriers/WindowBarrierView.ts`, `src/zombies/maps/BurnedMansionConfig.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `src/audio/AudioSystem.ts` y tests asociados.

**Aprendido**: en el espacio local de `WindowBarrierView`, `+Z` coincide con la normal exterior declarada por la barrera. Las ventanas nuevas necesitan siempre el conjunto completo: hueco de muro, barrera, marco y spawn con puntos de aproximacion y entrada.