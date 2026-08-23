# Armeria del Bunker y recarga de municion

**Que**: los pickups gratuitos de Ray Gun y ZEUS-99 pasan a ser compras de
2000 y 3000 puntos dentro de vitrinas individuales de cristal reforzado. La
habitacion inicial de Burned Mansion, ampliada dos metros hacia el sur,
incorpora en su esquina sureste una caja reutilizable con tres cartuchos
visibles que, por 800 puntos, rellena solo el cargador y la reserva del arma
equipada.

**Por que**: el Bunker necesitaba comunicar visualmente que contiene las dos
armas especiales y hacer que su obtencion participe en la economia. La caja
aporta una compra de municion universal sin duplicar cantidades ni conocer el
inventario desde el mapa.

**Donde**:
- `BurnedMansionConfig` centraliza precios, etiquetas y posiciones.
- `BurnedMansionArena` construye vitrinas ligeras con arma visible, estructura,
  cristal, luz y basamento collider; su estado reclamado abre el cristal y se
  restaura con `reset()`. La caja usa el mismo contrato espacial, un icono 3D
  de municion y un feedback breve de tapa/luz. La ampliacion desplaza de forma
  coherente suelo, techo, paredes, ventana, spawn, mobiliario e iluminacion de
  la fachada sur sin modificar el bunker ni las salas desbloqueables.
- `ZombiesMode` conserva la prioridad de USE, valida antes de cobrar y usa
  `PlayerEconomy.spend` para cobros atomicos. Los prompts se adaptan a teclado
  y tactil como el resto de interacciones.
- `ModeContext` expone recarga de la equipada; `Game` la resuelve mediante
  `WeaponInventory.currentWeapon` y `Weapon.refillAmmo()`, que ya conoce los
  maximos configurados para cargador y reserva.

**Aprendido**: la recarga generica no debe recibir un `WeaponId` desde el mapa:
eso permitiria rellenar un arma no equipada. La seleccion permanece en el
shell propietario del inventario y el mapa solo declara coste e interaccion.
Los basamentos se registran en los mismos colliders usados por jugador,
balistica y navegacion zombie, manteniendo libres la escalera y los recorridos
entre ambas vitrinas.
