# M4A1 clasica y cargador desmontable

**Que**: la M4A1 usa un modelo procedural dedicado con guardamanos corto estriado, upper/lower separados, asa abierta y miras mecanicas, canon escalonado, empunadura inclinada, culata telescopica y cargador STANAG. La postura desde la cadera se acerca al centro. No cambia ninguna estadistica ni tiempo de recarga.

**Por que**: WeaponView anadia un cargador animado al GLB mono-mesh sin eliminar el original. Recolocar ese segundo cargador no podia vaciar el brocal durante la recarga.

**Donde**: `src/weapons/M4A1ViewModel.ts` construye el modelo; `WeaponView.ts` selecciona el builder; `WeaponTypes.ts` registra el frame; `src/config/weapons.ts` selecciona modelo, postura y miras; `tests/m4a1View.test.ts` cubre geometria, presupuesto y recargas tactica/vacia con interrupcion.

**Aprendido**: todo el cargador, incluida la base y sus nervaduras, pertenece al mismo grupo animado. El cuerpo tiene un brocal abierto sin geometria de cargador integrada. ReloadAnimator ya oculta, inserta y restaura correctamente una pieza independiente, por lo que no necesita cambios compartidos. Las piezas se fusionan por material dentro de cada conjunto durante la construccion: 1984 triangulos y 21 llamadas de dibujo para el arma, sin trabajo geometrico por frame ni nuevas texturas.

**Validacion**: tests de modelo/recarga y typecheck correctos. La suite completa inicial termina con 549 tests correctos y dos fallos fuera de este cambio: navegacion del Brute al bunker y cantidad de mallas articuladas del Walker. Revision en navegador integrado de perfil, cadera, ADS y fases de recarga; no se ejecuta build.