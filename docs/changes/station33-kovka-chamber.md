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
- Presupuesto: la sala y el reactor son geometria estatica del batch (unos
  12k triangulos; seis materiales nuevos, ninguna textura nueva) con
  proxies AABB simples. Para la sala y su galeria se ampliaron los topes de
  `drawables`, `visibleDrawables`, `colliders`, `wallBoxes` y `navCells` del
  contrato de arena de Station 33; triangulos y geometria siguen dentro de
  los topes previos.
