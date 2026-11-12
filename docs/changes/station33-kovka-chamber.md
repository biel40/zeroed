# Station 33: camara KOVKA (fase 1, sala y reactor)

- Que: nueva zona `kovka` de Station 33, la forja experimental donde ira la
  futura maquina de mejora de armas. Solo geometria, reactor e iluminacion
  basica; ni mision de desbloqueo ni mejoras.
- Donde: al oeste del eje de la escalera, el unico hueco libre de la planta 0
  (todo lo construido esta en x >= 4,2), en z de -70,5 a -40,5.
- Acceso: una compuerta de pago (3500) en el muro oeste de la sala de
  maquinas, entre su muro norte y el motor-generador oeste, y una galeria
  (`KOVKA_CORRIDOR`) que cruza el eje de la escalera hasta la cubierta frente
  al reactor. Una primera version la abria en el muro norte del vestibulo,
  pero eso dejaba cinco puertas a la venta en la zona inicial: el vestibulo
  no admite mas puertas. Electricidad es ademas la sala que alimenta el
  reactor. La galeria cruza el eje muy al norte de la escalera mecanica: el
  anden futuro debe quedar por debajo de la planta 0 en ese punto.
- Altura: la superficie esta a y = 7 y su nieve cubre todo al norte de
  z = -30, asi que la boveda no puede pasar de ~6,8 m. Los ~12 m pedidos
  salen de un foso de 5,3 m bajo el reactor. El foso no es otra planta: sus
  barandillas son solidos bajos (0,6 m) que paran cuerpos y navegacion sin
  frenar las balas que apuntan dentro.
- Escala: 22 x 30 m en planta frente a los 30 x 22 propuestos, para que el
  rectangulo de navegacion crezca solo hacia el oeste (+17 % de celdas en la
  planta 0).
- Ambientacion: la primera version se veia sosa y la boca de la galeria
  rara (una pilastra visual en mitad del paso y un soporte de pasarela
  flotando). Se corrigio y se añadio `KovkaDressing` (celdas de sujetos,
  camilla, pupitre, foso inundado, ganchos, sangre y quemaduras), polvo,
  goteo y cables en `Station33Atmosphere`, una baliza roja sobre las celdas
  y un gemido metalico como evento de ambiente, con sonidos ya existentes.
- Presupuesto: la sala, el reactor y el decorado son geometria estatica del
  batch (unos 16k triangulos; ocho materiales nuevos, ninguna textura nueva;
  el atlas de rotulos crece una fila) con proxies AABB simples. Se ampliaron
  los topes de `drawables`, `visibleDrawables`, `visibleTriangles` (185k a
  190k), `colliders`, `wallBoxes` y `navCells` del contrato de arena de
  Station 33. Triangulos totales (198,9k de 200k) y geometria (16,9 de
  17 MiB) quedan casi al limite en el perfil alto.
- Forja y acceso: la sala parecia no servir para nada y nada avisaba de
  cuando usarla. Ahora la compuerta lleva un sello (`PointDoorSeal`) y no se
  vende hasta la electricidad, con aviso, piloto rojo/verde y subtitulo en
  el aviso de electricidad; dentro, la `UpgradeMachine` compartida forja el
  arma en mano (5000, treinta segundos, doble dano, recarga y acabado del mapa
  por `setWeaponFinish`). Para no tocar el inventario, el arma no sale de
  la mano durante la forja; el acabado `KOVKA_WEAPON_FINISH` es provisional.
  Topes del contrato: `triangles` 205k, `geometryMiB` 17,5 y `materials` 260.
- Acabado de las armas forjadas: el tinte provisional (acero azulado) se
  sustituye por una nebulosa animada en shader con arcos electricos
  (`ElectricArcRibbons`, extraidos de los arcos ZEUS-77 de los zombis para
  compartirlos). Las copias de material del tinte perdian el parche de
  profundidad del arma en primera persona (`Material.clone` no copia
  `onBeforeCompile`), asi que un arma forjada podia atravesar paredes; el
  acabado nuevo lo conserva.
