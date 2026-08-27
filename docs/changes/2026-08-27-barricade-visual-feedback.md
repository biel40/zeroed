# Barricade visual feedback

**Que**: las tablas destruidas reciben ahora un impacto breve, se desprenden, caen con variaciones moderadas por tabla y se ocultan tras 0.64-0.76 s. Las tablas reconstruidas entran desde un desplazamiento cercano, encajan con un pequeno overshoot durante 0.32 s y terminan en su transformacion original exacta.

**Por que**: el HP cambiaba antes la visibilidad de inmediato, por lo que el dano zombie y las reparaciones carecian de feedback fisico legible.

**Donde**: `WindowBarrier` expone revisiones de transicion sin cambiar las reglas de dano o reparacion; `WindowBarrierView` posee el estado de animacion independiente y las transformaciones originales; el update existente de la arena mueve solo las vistas de zonas activas. El audio de madera acompana exclusivamente el impacto que rompe una tabla y se agrupa a un unico sonido por frame para evitar rafagas de nodos Web Audio, mientras el audio de reparacion suena cuando la tabla termina de encajar.

**Aprendido**: una revision monotona por tabla conserva la ultima transicion visual aunque reparacion y dano ocurran entre dos frames renderizados. El reset cancela animaciones y restaura posicion, rotacion y escala sin deltas acumulados.
