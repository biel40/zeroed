# Rediseño Government de la M1911

**Qué**: la M1911 procedural usa proporciones full-size, corredera Government, empuñadura inclinada hacia atrás, guardamonte ovalado, miras GI, martillo de espolón, bushing y tapón del muelle; su pose de cadera queda anclada al borde inferior derecho y su Wall Buy reproduce el mismo perfil M1911A1 con hueco real en el guardamonte.

**Por qué**: el modelo anterior acumulaba detalles sobre masas rectangulares mal proporcionadas. La empuñadura incluso se inclinaba hacia la boca, mientras la plantilla mural genérica seguía pareciendo una pistola arbitraria.

**Dónde**: `src/config/weapons.ts`, `src/weapons/WeaponView.ts`, `src/zombies/wallbuys/WallBuyView.ts`, `tests/m1911View.test.ts`.

**Aprendido**: en un modelo low-poly la identidad depende primero de la silueta y las proporciones, no del número de piezas. Los perfiles `Shape` extruidos permiten expresar el frame, el grip y los espacios negativos sin romper las referencias animadas de corredera y cargador. En la pose un valor Z más negativo aleja el viewmodel; acercarlo y bajar Y evita que la pistola parezca suspendida frente al jugador.
