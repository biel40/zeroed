# Rediseño visual y animado de Mystery Box

**Qué**: la Mystery Box pasa a ser un cofre procedural mas grande y detallado, con apertura, cierre y retirada animada del arma.
**Por qué**: la caja anterior tenia una silueta pequeña, una apertura casi instantanea y ocultaba el resultado de golpe al recogerlo o expirar.
**Dónde**: `src/zombies/MysteryBoxView.ts`, `src/zombies/MysteryBox.ts`.
**Aprendido**: en Burned Mansion el frontal mira hacia el interior de la sala, no hacia las ventanas del muro oeste. El resultado aparece exactamente 5 segundos despues de activar la caja, incluidos los 0.7 segundos de apertura, sin depender de la duracion del audio.
