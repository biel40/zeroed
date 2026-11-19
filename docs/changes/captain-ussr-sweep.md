# CAPITÁN URSS: barrido electrico y ritmo de oleadas de Station 33

- Que: desde la ronda 6 (`ZOMBIE_LATE_ROUND_START`), las rondas normales de
  Station 33 usan el 92 % del intervalo entre apariciones. El jefe añade en la
  fase 2 un barrido electrico por franjas y en la fase 3 lo encadena dos veces.
- Por que: el medio juego de Station 33 se quedaba corto de presion y las
  fases 2 y 3 del duelo podian resolverse sin cambiar de posicion.
- Decisiones:
  - La cadencia es un dato del mapa (`ZombieMapDefinition.wavePacing`), no un
    caso del modo. Escala tambien el suelo de 0,35 s para que el cambio se note
    en rondas altas. Con el tope de 24 vivos, las 24 primeras apariciones de
    cada ronda nunca esperan al tope, asi que el cambio se percibe.
  - El barrido se tira tras una carga que no sale, para no alterar las
    secuencias ya probadas de carga, golpe al suelo y onda.
  - La primera franja sigue la linea jefe-jugador y la segunda la cruza en
    perpendicular. Asi nunca coinciden y la primera ya ha descargado cuando
    hay que esquivar la segunda. A 3,5 m/s con 0,4 s de reaccion sobra tiempo
    para salir de media franja (1,4 m) en 1,2 s; un test fija este margen.
  - La ventana de castigo reutiliza `stunned`: guardia baja y daño extra.
  - El duelo sigue siendo solo individual y Station 33 no admite cooperativo,
    asi que el daño no pasa por la autoridad de red.
