# Colision del jugador con la Mystery Box

- Que: la caja bloquea el movimiento del jugador desde sus cuatro lados,
  tambien al saltar, sin bloquear el bunker situado debajo ni impedir USE.
- Por que: la vista de la caja se creaba fuera del mapa y no se registraba
  ningun volumen en la lista de colisiones del jugador.
- Donde: `BurnedMansionArena` incorpora el cuerpo fijo, con base, herrajes y
  tapa cerrada, a `wallColliders` en cada reconstruccion. Individual,
  anfitrion e invitado ya consumen esa misma lista. `MysteryBox` comparte las
  dimensiones con `MysteryBoxView`; no cambia la balistica ni la logica de
  compra y recompensas.
- Aprendido: un prop visible no es automaticamente solido. Su collider debe
  respetar la rotacion y sobrevivir a los cambios de topologia. Los tests
  ejercitan el controlador real y usan un punto delante de la caja para
  comprobar la accesibilidad de la sala, en vez del centro ahora ocupado.
