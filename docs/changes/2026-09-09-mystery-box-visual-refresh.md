# Mejora visual de Mystery Box

**Que**: se alarga y rebaja la silueta procedural de la caja, se refuerzan sus tablones y herrajes, y el simbolo frontal se reconstruye como geometria 3D legible sin depender de UV.

**Por que**: la caja anterior se percibia demasiado cuadrada y el signo de interrogacion podia leerse invertido desde el frontal jugable.

**Donde**: `src/zombies/MysteryBoxView.ts` y `tests/mysteryBox.test.ts`.

**Aprendido**: la interaccion usa `mysteryBoxPlacement`, no la geometria de `MysteryBoxView`; cambiar la malla no requiere tocar coste, probabilidades, spawn ni raycast. Las particulas ahora nacen sobre el interior de la caja y el brillo se filtra por las ranuras de la tapa.
