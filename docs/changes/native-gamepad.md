# Soporte nativo de mando — 2026-10-31

La Gamepad API entra por `GamepadInput`, con estado independiente que `Input`
combina con desktop/tactil. `GamepadControls` conserva deteccion, familia y
navegacion entre mapas; se sondea desde el loop de `Game`, incluso en pausa.
Sin partida, `main.ts` mantiene exclusivamente el pump de menus. La entrada
llega a `PlayerController`, `Weapon` y los modos antes de serializar el estado
local; no se modifican DTOs, autoridad ni ownership cooperativo.

## Acciones y asignaciones

Inventario observado en `DesktopInput`, `MobileInput`, `PlayerController` y
`Game.frame`; el mapeo mantenido vive en
[GamepadBindings](../../src/player/GamepadBindings.ts).

La tabla conserva la asignacion inicial. En un ajuste posterior solicitado
por el usuario se intercambiaron recarga e interaccion: X/□ recarga y LB/L1
interactua, repara y reanima; los prompts se resuelven desde el mapeo central.

| Accion | Teclado / raton | Tactil existente | Xbox | PlayStation |
| --- | --- | --- | --- | --- |
| Moverse | WASD | Joystick virtual | Stick izquierdo | Stick izquierdo |
| Mirar | Raton con Pointer Lock | Arrastre de camara | Stick derecho | Stick derecho |
| Disparar | Boton izquierdo | FIRE (ADS y repeticion semi existentes) | RT | R2 |
| Apuntar | Boton derecho | FIRE | LT | L2 |
| Saltar / levantarse | Espacio | Sin boton dedicado | A | × |
| Agacharse / levantarse | C | AGACHAR | B | ○ |
| Tumbarse / levantarse | Z | TUMBAR | L3 | L3 |
| Interactuar / reparar / reanimar | E; mantener para reparar | USE / prompt | X | □ |
| Recargar | R | RLD | LB | L1 |
| Cambiar arma | 1 / 2 | WPN (ciclar) | Y (ciclar) | △ (ciclar) |
| Cuchillo | 3 / NUM 3 | KNIFE | R3 | R3 |
| Cambiar modo de fuego | X | Accion interna sin boton visible | RB | R1 |
| Inspeccionar arma | F | Sin boton dedicado | View | Share/Create |
| Pausa / continuar | ESC / menu | Boton pausa / menu | Menu | Options |
| Navegar menus | Foco HTML / raton | Tocar | Cruceta / stick izquierdo | Cruceta / stick izquierdo |
| Confirmar / volver | Controles HTML / Escape en dialogos | Tocar | A / B | × / ○ |

No existen sprint ni granadas. Los dispositivos genericos muestran numeros de
boton en base 1. Menu/Options en otro mando selecciona ese dispositivo; no
controlan al jugador varios mandos simultaneamente.

## Decisiones

Recarga e interaccion se separan porque E tiene semantica mantenida para
reparar, y un prompt puede representar una compra bloqueada o una condicion
pendiente. La validacion permanece en la interaccion existente; no se infiere
que un prompt visible equivale a una compra autorizada. La reanimacion conserva
su transaccion existente, iniciada por interaccion.

Los gatillos tienen histeresis y no repiten semiautomatico. Las zonas muertas
son radiales y reescaladas; el giro usa grados/segundo y delta, con ADS y eje Y
independientes del raton. Se conserva el limite de pitch y el recoil existente.
Al cerrar un menu se exige soltar los botones mantenidos y centrar los sticks,
para que confirmar no se convierta en salto o disparo. Desconexion, foco,
visibilidad y teardown liberan el estado del adaptador sin borrar entradas
fisicas de los otros dispositivos.

`GamepadMenuNavigation` activa controles DOM existentes y respeta los eventos
cancelables de los dialogos. La confirmacion PWA pasa de `window.confirm` a
un dialogo HTML: el bloqueo sincrono impedia seguir sondeando el mando.
La entrada de texto sigue siendo nativa.

## Validacion

Cobertura determinista en `tests/gamepad*.test.ts`, `confirmDialog.test.ts`,
`gameSharedPause.test.ts` y las regresiones de desktop, tactil, ajustes,
localizacion y cooperativo. No se han realizado pruebas de hardware ni
validacion visual automatizada.

Validar manualmente en Chrome, Edge, Firefox y Safari disponibles: USB/Bluetooth,
Xbox, DualShock/DualSense, reconexion, cambio de indice, dos mandos, los menus
de mapas/pausa/ajustes/fin, keypad, compras, Mystery Box, armas especiales,
disparo semi/auto, camara/ADS, reparacion y cooperativo. Repetir en PWA,
Android/Capacitor y Steam Deck cuando el navegador exponga mapeo estandar.
Verificar combinaciones de mando/raton/tactil, cambio de app y desconexion
con fuego, ADS, movimiento o navegacion mantenidos.

Los layouts no estandar se ignoran y se muestran como incompatibles. La
exposicion inicial puede requerir pulsar un boton fisico y depende del
navegador; audio, fullscreen e instalacion conservan las restricciones de
activacion del navegador. Steam Input solo funciona por su mapeo expuesto o
traduccion previa a teclado/raton. No se garantiza cada configuracion ni se
incorporan vibracion, remapeo o asistencia de apuntado.

## Fuentes modificadas

- `src/player/`: adaptador, bindings, presentacion de dispositivo, fachada y
  solicitud de Pointer Lock al volver al raton; `PlayerController` integra giro.
- `src/core/Game.ts`, `src/main.ts`: loop, inicio sin lock, pausa y ciclo de vida.
- `src/core/PlayerSettings.ts`, `src/ui/SettingsPanel.ts`, `index.html`,
  `src/style.css`, `src/i18n/{en,es,ca}.ts`: ajustes, foco y etiquetas localizadas.
- `src/ui/{HUD,InteractionPrompts,InteractionPromptView,GamepadMenuNavigation,DeveloperConsole,ConfirmDialog}.ts`,
  `src/pwa.ts`: prompts, overlays y confirmacion sin bloqueo del loop.
- `src/modes/ZombiesMode.ts`, `src/modes/coop/{CoopHostMode,CoopWorld}.ts`:
  cancelar reparacion en el cambio de arma del mando.
- Documentacion de arquitectura, sistemas, decisiones, estado y PWA; pruebas
  de mando/dialogos y fixtures de pausa/audio existentes.
