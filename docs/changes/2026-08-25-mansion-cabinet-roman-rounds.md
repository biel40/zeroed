# Sala Mystery Box despejada y rondas romanas

**Que**: se retira el armario solido `box-room-cabinet` de Burned Mansion y el indicador persistente de ronda del HUD pasa a numeros romanos entre las rondas 1 y 3999.

**Por que**: despejar visual y fisicamente la sala de Mystery Box y reforzar la identidad clasica del HUD Zombies sin alterar la progresion numerica.

**Donde**: `src/zombies/maps/BurnedMansionArena.ts`, `src/ui/HUD.ts`, `tests/burnedMansion.test.ts` y `tests/hud.test.ts`.

**Aprendido**: el prop visual era tambien la unica fuente de colision para jugador, balistica y navegacion, de modo que eliminar su construccion retira todo el obstaculo. Los banners, game over y ending conservan numeros arabigos; solo cambia `#z-round`.
