# Auditoría previa a Zeroed v1.0

Fecha: 2026-09-30. Revisión del árbol de trabajo, incluidos los cambios del final
nuclear de esta conversación. Este informe documenta el diagnóstico; no modifica
las reglas ni corrige los problemas encontrados.

## Dictamen

La base compartida está bien delimitada: Burned Mansion, armas, economía, rondas,
zombis, navegación, daño y controles se reutilizan. El individual permanece
independiente del servidor. El cooperativo tiene autoridad del anfitrión y una
réplica del invitado, con pruebas de integración y validación de mensajes.

Antes de cerrar la v1.0 conviene corregir las transacciones de inventario del
invitado y su salida si pierde al anfitrión durante el final. También hay que
resolver diferencias de salud, cobros de munición y el reinicio del hito Ray Gun
al entrar un nuevo invitado. Las pruebas actuales pasan, pero no cubrían estos
escenarios de concurrencia y ciclo de vida.

## Alcance y evidencia

- Inspección de documentación, arranque, shell, modos individual/anfitrión/
  invitado, mapa compartido, inventario, salud, rondas, combate, input,
  replicación, relays, audio, PWA, recursos y configuración Android.
- TypeScript sin errores; producción Vite y service worker generados.
- Suite existente: 724 pruebas correctas. Durante la ejecución completa se
  incluyeron cuatro reproducciones temporales adicionales: 728/728 correctas.
- Cinco reproducciones de auditoría correctas en una ejecución específica:
  salud distinta, inventario divergente, doble cobro de munición, indicador
  Ray Gun heredado y overlay del final conservado al perder al anfitrión.
  Son pruebas de caracterización: verifican que el problema existe, no que
  esté solucionado. Se retiró el archivo temporal tras registrar los resultados.
- Relay Node: su prueba WebSocket pasa. Relay Cloudflare: su prueba pasa contra
  Wrangler local, sin despliegue; servidor temporal detenido después.
- Sin sesiones reales entre dispositivos, medición de FPS/GPU, APK/AAB release,
  firma Android, validación de la cuenta de Play o escucha de los nuevos sonidos.
  Las reproducciones de compras aíslan la entrega del alcance espacial para
  comprobar la transacción; no simulan una conexión real de Internet.

## Comparación de modos

| Sistema | Individual | Cooperativo | Interpretación |
| --- | --- | --- | --- |
| Mapa | Burned Mansion | Burned Mansion | Misma arena y progresión de mapa |
| Simulación | Navegador local | Navegador anfitrión; invitado replica | Diferencia arquitectónica necesaria |
| Servidor | No necesita red | Relay WebSocket para dos jugadores | No hay simulación de juego en el relay |
| Inicio | Congelado hasta START | Espera a ambos; anfitrión puede continuar tras desconexión | Flujo distinto |
| Arsenal | M1911 inicial, dos armas | Igual para cada jugador | Mismos datos y reservas |
| Rondas y zombis | RoundManager, máximo 24 vivos | Mismo RoundManager y máximo 24 | No hay multiplicador por dos jugadores |
| Apariciones | Selección desde la posición del jugador | Alterna posición de jugadores vivos | Presión distribuida |
| Daño/headshots | Configuración compartida | Configuración compartida aplicada por el anfitrión | Daño base equivalente |
| Cuchillo | Daño según ronda y alcance local | Mismo daño; invitado reclama y anfitrión valida | Validación remota más permisiva |
| Salud máxima | 75 HP | 75 HP por jugador | Coincide |
| Invulnerabilidad tras golpe | 0,45 s | 0,9 s | Divergencia de ajuste |
| Inicio de regeneración | 2,8 s sin daño | 5 s sin daño | Divergencia de ajuste |
| Regeneración | 20 HP/s | 8 HP/s | Divergencia de ajuste |
| Muerte | Game over al llegar a cero | Caída 20 s, reanimación 2 s y 40 % HP; game over cuando no queda superviviente | Diferencia de diseño |
| Points | Cartera del jugador | Cartera individual; paga quien compra | No se suman para comprar el final |
| Puertas/secretos | Progresión local | Compartida | Misma geometría y reglas de desbloqueo |
| Vitrinas | Una compra por run | Una compra por sala, para el comprador | No entregan el arma a ambos |
| Mystery Box | Uso exclusivo del jugador | Compartida, resultado reservado al comprador | Diferencia intencionada |
| Ray Gun de 115 bajas | Hito individual | Hito individual por jugador | Coincide salvo entrada de nuevo invitado |
| Pausa | Detiene toda la simulación | Anfitrión detiene ambos; invitado abre menú sin detener el mundo | Implementación actual, documentada |
| Reinicio | Reinicia la run | Solo anfitrión; invitado recibe matchRestart | Tras game over desktop el invitado debe pulsar START de nuevo |
| Munición | Control local | Control local; el host valida armas/cadencia, no cargadores del invitado | Límite de autoridad conocido |
| Latencia | Sin retraso de red | Compañero ~120 ms y zombis ~140 ms de interpolación, además del tránsito de red | Impactos visibles y autoridad no son simultáneos |
| Música de partida/pausa | Activa | Activa en ambos roles: los tres modos tienen id zombies | No falta la música de fondo en cooperativo |
| Audio ambiental/impactos | Pasos, gemidos y feedback completo | Cobertura parcial, especialmente en invitado | Falta paridad audiovisual |
| Final nuclear | 18 s con créditos y tres capas de audio | Misma secuencia activada por estado del host | Falta recuperación ante pérdida del anfitrión |
| Pérdida del compañero | No aplica | Host sigue solo; pérdida del host termina sala | Sin migración ni recuperación del inventario |

El cooperativo reparte una misma horda entre dos jugadores y añade reanimación,
pero tarda más en curar y protege más tiempo tras cada golpe. No se puede concluir
que sea globalmente más fácil o difícil sin probar estas reglas juntas.

## Hallazgos priorizados

### A1 — Alta: inventario del invitado divergente durante una entrega

El anfitrión reemplaza el arma declarada al solicitar una compra; el invitado
reemplaza la que tiene seleccionada cuando llega la respuesta. Los mensajes de
entrega no incluyen la ranura reemplazada ni un inventario autoritativo.

Reproducción: invitado con M1911/AK-47 solicita M4A1 teniendo M1911 seleccionada
y cambia a AK-47 antes de recibirla. Host queda con M4A1/AK-47; invitado queda
con M1911/M4A1. Después el host puede rechazar estados/disparos del arma que el
invitado todavía cree poseer. La prueba existente de reemplazo solo verificaba
el inventario del host, con grantWeapon simulado.

Evidencia: `CoopHostMode.ts:802–805`, `CoopGuestMode.ts:365–369`,
`WeaponInventory.ts:grant`, `Game.ts:grantWeapon`. Mismo patrón en caja,
vitrinas y premio de 115 bajas; reproducción directa realizada para wall buy.

Cambio propuesto: entrega autoritativa que indique inventario/ranura reemplazada
y se aplique igual en ambos clientes. Añadir prueba con dos inventarios reales
y cambio de arma entre solicitud y confirmación. Bloquear solo una compra
pendiente no cubre todos los premios y entregas del juego.

### A2 — Alta: pérdida del anfitrión durante el final puede atrapar al invitado

`onHostLost()` borra el estado de partida y detiene el audio, pero no retira el
overlay nuclear ni pasa a créditos. La reproducción confirma que se conserva
showEnding sin hideEnding/showCredits. La salida queda oculta durante ENDING y
solo se habilita cuando llega el estado credits, que ya no llegará.

El bloqueo de interacción se deduce del flujo y CSS: ending-screen tiene z-index
40; pause-menu, 22. Requiere confirmación visual en navegador, pero la ausencia
de recuperación del estado ya está reproducida. Afecta al nuevo final de esta
conversación; el final normal con conexión estable sí está probado.

Evidencia: `CoopGuestMode.ts:448–457,527–541`, `style.css:1103,1204`,
`ZombiesMode.ts:finishRun`, callbacks de créditos de ambos modos cooperativos.

Cambio propuesto: transición explícita de salida recuperable o finalización local
del final ante pérdida del host, manteniendo disponible volver al menú.

### A3 — Media: salud cooperativa con constantes antiguas

Individual importa PLAYER_HIT_INVULN/PLAYER_REGEN_DELAY/PLAYER_REGEN_RATE;
cooperativo tiene números literales 0,9/5/8. Prueba: dos golpes separados 0,5 s
entran en individual pero solo uno en coop; tras un golpe y 3 s de actualización,
individual alcanza 75 HP y coop sigue a 50 HP.

Evidencia: `ZombiesMode.ts:87–92`, `CoopHostMode.ts:58`,
`ZombieConfig.ts:265–272`.

Cambio propuesto: usar las mismas constantes si se quiere paridad. Si la diferencia
es deliberada, declarar un ajuste cooperativo explícito y probarlo; no mantener
dos versiones implícitas del equilibrio. Conservar la prioridad del individual.

### A4 — Media: doble cobro de munición del búnker al invitado

El invitado comprueba localmente si está lleno antes de enviar mapUse/ammo,
pero no marca la operación como pendiente. Dos pulsaciones antes de recibir la
primera entrega pasan esa comprobación. El host desconoce la munición remota y
acepta/cobra las dos peticiones: 1600 Points para dos solicitudes de 800.
La segunda entrega no aporta munición si la primera ya llenó el arma.

En individual y host la comprobación/entrega son inmediatas; no existe esta
ventana de red. Las compras de pared y caja ya tienen flags de espera locales.

Evidencia: `CoopGuestMode.ts:239–243,402–405`, `CoopHostMode.ts:856–869`.

Cambio propuesto: una transacción pendiente identificable para recarga de búnker,
con confirmación/fallo y protección ante cobros repetidos. Añadir prueba de dos
peticiones antes de confirmar y validar también cambio de arma durante recarga.

### A5 — Media: un nuevo invitado hereda el hito Ray Gun anterior

onGuestJoined reinicia cartera, bajas e inventario, pero no rayGunUnlocked.guest.
Prueba: tras entrar un nuevo invitado quedan cero bajas y M1911 inicial, con el
indicador de Ray Gun todavía true. Al llegar a sus 115 bajas no recibirá ese premio.

Evidencia: `CoopHostMode.ts:962–975` frente a la condición de `685–697` y
el reset completo de `1033–1034`.

Cambio propuesto: reiniciar el indicador junto al resto del registro del invitado.
No implica conservar inventario tras reconectar: eso sigue fuera del diseño actual.

### A6 — Media: faltan señales audiovisuales en cooperativo

Ambos roles cooperativos omiten ZombieFootsteps y los gemidos ambientales del
individual. El cue MP3 de inicio de ronda solo se llama en individual; en coop
se reproduce el sting procedural. Los disparos normales cooperativos muestran
hitmarker pero omiten los sonidos específicos de impacto/headshot y el puff de
sangre del individual. El invitado tampoco conecta rugidos Brute o impactos
sonoros de los zombis contra tablas. El host sí tiene esos dos callbacks.
Cuando el host pausa, el invitado congela su simulación pero no pausa
automáticamente su música: applyMatchState solo actualiza el estado y el HUD.

Evidencia: `ZombiesMode.ts:273–277,178,248,849,973–980`,
`CoopHostMode.ts:169–170,240–248,500–506`,
`CoopGuestMode.ts:163–173,347–351`, `ZombieReplica.ts:attack/hit`.

Cambio propuesto: reutilizar vistas/cues existentes en ambos roles, respetando
qué cliente debe oír cada evento y evitando duplicar sonidos predictivos y
confirmados. No hace falta duplicar la simulación para reproducir pasos locales.

### A7 — Media: acciones táctiles fuera de la validación central de gameplay

El cambio táctil de arma llama directamente cycleWeapon, que no consulta pausa,
vida, reanimación ni estado final. La selección de teclado sí pasa por
allowCombatInput. Además, la reparación individual y del host se cancela al
detectar Digit1/2, pero el cambio táctil no produce ese evento.

La exposición exacta depende del overlay y del orden de eventos DOM; el camino
sin validación se confirma leyendo el código. Probar específicamente cambiar
arma mientras se mantiene USE, durante reanimación y al abrir pausa.

Evidencia: `Game.ts:190,463–467,623–631`, `MobileInput.ts:95`,
`ZombiesMode.ts:775–788`, `CoopHostMode.ts:475–482`.

Cambio propuesto: una acción de cambio de arma que pase por los mismos permisos
en teclado y táctil, y notifique la cancelación de reparación.

### A8 — Decisión de lanzamiento: comando GOD MODE activo en producción

MOTDRULES activa invencibilidad, gasto ilimitado y ZEUS con reserva infinita
sin guardia de desarrollo en individual. Coop no implementa ese comando.
Está cubierto por tests y puede ser un secreto deliberado; no es un fallo de red.

Evidencia: `ZombiesMode.ts:934–945`, `Game.ts:231–233`.

Decidir explícitamente si forma parte de v1.0 o si debe quedar solo en desarrollo.
No retirarlo automáticamente durante una auditoría.

## Revisión transversal y preparación móvil

### Código, rendimiento y mantenimiento

- Armas, inventario, economía, salud, rondas, pool y daño tienen lógica separada
  y pruebas. El mapa compartido evita mantener dos mansiones distintas.
- La orquestación de interacciones y entregas está duplicada entre los modos;
  las divergencias de salud/audio muestran dónde conviene reutilizar contratos.
  No se recomienda un refactor masivo antes de publicar.
- El host realiza IA y navegación además de dibujar al compañero; el invitado
  dibuja e interpola la réplica. Ser host en móvil necesita medición propia.
- Assets actuales de public/assets: 20 archivos, unos 15,26 MiB; el GLB del
  compañero pesa 297964 bytes. Música de menú/partida suma unos 9,24 MiB.
  El bundle JS principal de producción es ~1,04 MB (~282 KB gzip). No son
  mediciones de memoria GPU ni del tamaño final del AAB.
- AssetManager precarga texturas y BurnedMansionMaterials las vuelve a cargar
  con su TextureLoader; pueden reutilizar caché HTTP, pero generan objetos de
  textura adicionales. Revisar memoria al volver al menú y entrar varias veces.
- Game libera loop, listeners, renderer y contexto. No sustituir esa revisión
  con la suposición de que todos los recursos del mapa tienen dispose explícito;
  medir sesiones repetidas antes de declarar una fuga.
- La energía individual identifica Tesla por color y coop por referencia de
  configuración. Funciona con el arsenal actual; compartir identidad explícita
  será mejor al extenderlo. No es necesario bloquear v1.0 por este refactor.

### Red y recuperación

- Relay de versión 6, salas de dos, mensajes reservados protegidos y payload
  limitado a 32 KiB. Node tiene heartbeat; el test local de ambos relays pasa.
- Los proyectiles normales del invitado validan propiedad, distancia y crédito
  de disparo, pero no reconstituyen su raycast/obstáculos ni verifican munición.
  El cuchillo remoto tolera 0,5 m extra y no vuelve a raycastar la línea de ataque.
  Es apropiado describirlo como coop privado con validación parcial, sin prometer
  protección competitiva contra un cliente modificado.
- acceptGuestState limita bounds/velocidad, pero no envía corrección de posición
  al jugador ni colisiona su movimiento remoto contra paredes. Medir divergencias
  bajo latencia, especialmente en escaleras y al abrir el búnker.
- El timeout de invitado cubre la ausencia del primer matchState; no hay watchdog
  equivalente para un anfitrión ya sincronizado cuyo navegador queda suspendido.
  Si el socket sigue abierto, el invitado puede quedarse con un estado congelado.
- Reinicio tras game over requiere START del invitado en desktop para recuperar
  Pointer Lock. Documentarlo y comprobar que no se confunde con un bloqueo.

### Android, segundo plano y duración del final

- Capacitor apunta a dist; appId es es.zeroed.game; versionName 1.0/versionCode 1;
  SDK mínimo 24 y target/compile 36. Esto describe el repositorio, no verifica
  requisitos actuales de Google Play ni una publicación.
- Los scripts generan/instalan APK debug. No hay signingConfig ni comando de
  AAB release documentado en el proyecto; puede hacerse fuera del repositorio,
  pero queda pendiente validar ese proceso, la firma y el paquete final.
- VITE_COOP_SERVER_URL debe incluirse al construir Android. Sin esa variable,
  main.ts deriva el relay del origen del WebView; no será el Worker desplegado.
  La URL guardada en la interfaz tampoco sustituye una comprobación del build
  instalado. No se inspeccionó configuración privada externa de Vercel/Play.
- No hay integración explícita del ciclo de vida nativo. El adapter desktop
  también existe en táctil y libera input al perder foco/visibilidad, pero
  Game ignora cambios de Pointer Lock en táctil. Verificar suspensión, bloqueo
  de pantalla, vuelta a la app y desconexión; no dar por garantizada la pausa.
- CSS/audio usan tiempo real; el final usa dt de simulación, limitado a 50 ms.
  A menos de 20 FPS, o si se suspende el host, los créditos pueden completar su
  animación antes de que el estado de 18 s habilite la salida. Pendiente una
  fuente de tiempo coherente y prueba con frames lentos/segundo plano.
- Los tres nuevos MP3 nucleares todavía no están presentes. El juego tolera su
  ausencia, pero falta escuchar y ajustar la mezcla en un teléfono real.

### PWA y documentación

- Shell precacheado, assets con runtime cache y fallbacks. Offline significa
  disponer de los recursos previamente solicitados, no garantizar que cada
  asset se descargue antes de desconectar. Coop siempre necesita relay.
- PROJECT_STATE/ROADMAP conservan pendientes ya superados: Game sí congela
  individual antes de START y bloquea movimiento/disparo en game over; las
  barreras destruidas son reparables en la lógica actual. Mantener pruebas
  manuales, pero no tratar esas notas históricas como fallos confirmados.
- ARCHITECTURE/DECISIONS describen la pausa coop como solo local; el código y
  MULTIPLAYER explican que la pausa del host congela a ambos. PWA.md aún dice
  probar ambos mapas aunque Burned Mansion es el único jugable.
- ASSETS documenta procedencias y un certificado del tema de menú; no detalla
  la procedencia de todos los MP3 existentes ni de los tres nuevos. Completar
  ese inventario junto con la entrega de assets; no es una evaluación legal.

## Orden recomendado antes de v1.0

1. Corregir A1 y A2, con pruebas de inventario real y salida durante el final.
2. Corregir A4/A5 y decidir la paridad de salud A3 y GOD MODE A8.
3. Completar audio A6 y permisos táctiles A7; incorporar los tres assets nucleares.
4. Probar PC/PC, PC anfitrión/móvil invitado y móvil anfitrión/PC invitado:
   compra con cambio de arma, recarga, cuchillo, Ray Gun/ZEUS, ventana totalmente
   destruida, reanimación, pausa de ambos roles y reinicio tras game over.
5. Hacer una run individual offline y otra cooperativa hasta el final; cerrar
   host durante ENDING, salir/entrar un invitado, volver al menú varias veces,
   bloquear/desbloquear teléfono y probar latencia de 100–250 ms con jitter.
6. Confirmar FPS/memoria en un Android modesto, relay del build nativo y
   AAB release firmado. Después actualizar documentación y cerrar la versión.

No se propone reintroducir Classic ni alterar el equilibrio individual para
compensar los problemas cooperativos.
