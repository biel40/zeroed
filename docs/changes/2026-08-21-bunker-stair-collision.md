# Colision estable en la escalera del Bunker

**Que**: la escalera del Bunker incorpora costados fisicos continuos que impiden entrar lateralmente en una altura invalida, conserva ambos rellanos abiertos para subir y bajar, y elimina mesas, bloques, tubos y monitores decorativos sin funcion.

**Por que**: el volumen de altura de la rampa no tenia limites laterales. Un jugador o zombie que lo cruzaba desde un costado recibia de golpe la altura interpolada de media pendiente, provocando saltos de camara, cuerpos flotantes y recuperaciones de navegacion.

**Donde**: `src/zombies/maps/BurnedMansionArena.ts`, `src/zombies/ZombieManager.ts`, `tests/burnedMansion.test.ts`.

**Aprendido**: el volumen que calcula la altura no sustituye una colision fisica. Los costados deben bloquear al jugador y alimentar la misma rejilla A* de los zombies, mientras los extremos necesitan margen para el radio corporal. Con limites reales, el corredor zombie debe activarse solo dentro del ancho de la rampa y no desde su expansion lateral historica.