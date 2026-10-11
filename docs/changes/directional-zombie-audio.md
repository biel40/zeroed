# Audio direccional de zombis

- Que: la aparicion, el inicio del ataque (gruñido o rugido del Brute), las
  tablas arrancadas, los gemidos ambientales y el golpe recibido suenan desde
  su origen. Lo que queda a la espalda o en otra planta suena apagado, tambien
  en los pasos.
- Por que: solo los pasos eran posicionales; el resto sonaba centrado y el
  panorama estereo no distingue delante de detras, asi que el jugador no sabia
  por donde entraban ni desde donde le atacaban.
- Donde: `SpatialCue` calcula pan, atenuacion y `muffle` (paso bajo) y
  sustituye los dos calculos duplicados de `ZombiesMode` y `CoopWorld`;
  `AudioSystem.spatialBus` aplica el filtro. `ZombieManager` expone la
  ventana en `onBarrierImpact`, el atacante en `onPlayerAttack` y usa
  `onZombieAttack` tambien en individual (sustituye a `onBruteAttack`). En
  cooperativo `playerDamaged` lleva `attackerId` y el invitado deriva las
  roturas de tablas de las instantaneas.
- Aprendido: medir el apagado por planta desde la altura de la voz
  (`voicePoint`), no desde los pies: si no, un zombie en la misma planta y
  otro en la de arriba quedan a la misma distancia vertical de la camara. La
  primera instantanea del invitado es una linea base silenciosa; derivar
  eventos de un estado sin ella reproduce daños antiguos al unirse. En el
  bucle por frame de los pasos se usa `spatialMuffle` con vectores reutilizados.
