# Navegacion del bunker y acabado M1911

**Que**: las escaleras del bunker forman ahora un corredor de navegacion continuo que centra las hordas en los rellanos y conserva su separacion sobre el eje de la pendiente; la M1911 procedural se organiza bajo `m1911-root` y recibe frame, corredera, canon, guardamonte, martillo y miras unidos y proporcionados.

**Por que**: el portal aceptaba una distancia de llegada de 10 cm aunque la rampa comenzaba solo 3 cm antes de su extremo. Con varios zombis, la separacion lateral y el wall-following los expulsaban de la entrada o de la rampa, perdiendo la altura continua. En la pistola, varias primitivas no solapaban con la pieza estructural correspondiente y parecian suspendidas.

**Donde**: `src/zombies/ZombieManager.ts`, `src/weapons/WeaponView.ts`, `tests/burnedMansion.test.ts`, `tests/m1911View.test.ts`.

**Aprendido**: el A* por planta debe llevar al portal, pero dentro de una transicion explicita manda su corredor: no se recalcula A* ni se activa wall-following. La separacion se proyecta longitudinalmente y el centrado sigue siendo velocidad normal, sin teletransporte. La corredera y el cargador conservan movimiento local mecanico bajo la raiz animada del arma; al recargar vacio se limpia el blowback residual para volver a bateria una sola vez. `RoundedBoxGeometry` reduce sus bounds efectivos al biselar, por lo que las primitivas de la M1911 se normalizan a las dimensiones solicitadas antes de colocar estrias, controles, paneles y miras; de lo contrario esos detalles quedan fuera del cuerpo aunque las cifras nominales parezcan correctas.
