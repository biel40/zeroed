# Visores de desarrollo

Estas entradas de Vite son herramientas manuales de revisión visual. No forman parte del juego ni deben importarse desde `src/`.

Inícialas con `npm run dev` y abre las rutas indicadas en el navegador.

## Visor de armas

`weapon-viewer.html` carga un modelo de arma con la iluminación y el tone mapping del juego. Sirve para revisar el encuadre, el modelo en primera persona y las poses hip/ADS sin iniciar una partida.

- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=ak47&view=pov`: compara hip y ADS en primera persona.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=m60&view=external`: muestra las siluetas hip y ADS desde fuera.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=ak47&view=closeup`: inspecciona el receptor y el cañón. Acepta `pose=ads`, `cam=x,y,z` y `look=x,y,z`.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=m1911&view=knife`: fases del tajo del cuchillo con el arma bajando y la mira marcada. Acepta `t=0.3` (un fotograma, progreso 0..1) y `play=1&slow=4` (bucle ralentizado).
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=ak47&view=reload`: fases de una recarga vacia con las dos manos. Acepta `t=0.5`.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=m4a1&view=rig`: el rig de primera persona visto desde fuera (alcance de los brazos, codos, plano cercano). Acepta `pose=ads`, `t=` (fotograma de una recarga vacia), `cam=`, `look=` y `fov=`; con `cam=0,0,0` y un `fov` cerrado sirve de lupa sobre una mano.
- Las vistas en primera persona dibujan los brazos: `arms=0` los oculta y `detail=mobile|lowMemory` elige el nivel de detalle. La esquina inferior derecha muestra draw calls y triangulos del fotograma.
- `view=pov&pose=hip` o `pose=ads` muestra un solo encuadre. En las vistas `pov`, `reload` y `knife`, `map=station-33&worldCam=3,1.7,8&worldLook=7,1.65,4` permite revisar el arma con la geometria y las luces reales del mapa; `power=1` enciende su electricidad.
- Con mapa se muestra una sola pose para no duplicar arenas: hip por defecto, recarga al 10 % o cuchillada en el instante del golpe. `pose=ads` y `t=0..1` seleccionan el encuadre y la fase que se quiere revisar.

## Visor de zombies

`zombie-viewer.html` carga al walker (o a Brutus con `model=brute`) con cámara orbital. Sirve para revisar sus clips, acabados, variantes y coste de dibujo de manera aislada.

- `http://localhost:5173/tools/viewers/zombie-viewer.html?compare=1`: compara Shiny con zombies normales.
- `http://localhost:5173/tools/viewers/zombie-viewer.html?shiny=1&night=1`: inspecciona el brillo de Shiny en baja luz.
- `http://localhost:5173/tools/viewers/zombie-viewer.html?state=death&death=all`: los siete estilos de muerte en fila, en bucle (andar, caer, cadáver). `death=slash` muestra uno solo desde tres ángulos y `time=0.6` congela ese instante de la caída; admite `model=brute`. `electric=1` mantiene los rayos residuales de la ZEUS-77 sobre los cuerpos (la muerte `shock` siempre los lleva).
- `http://localhost:5173/tools/viewers/zombie-viewer.html?skin=all`: todas las skins del walker en fila. `skin=fieldOfficer` viste a los tres zombies con una sola; se combina con `close=1`, `state=`, `speed=0` (pose quieta) y `redEyes=1` (ojos rojos de Station 33).
- Parámetros adicionales: `state=attack`, `time=0.475` y `close=1`.
- `?skin=all&hatshot=1&redEyes=1`: los gorros caen en bucle; `time=1.5` congela la caida para revisar el contacto con el suelo.
- `?blood=knife&speed=0` y `?blood=bullet&speed=0`: salpicaduras de cuchillo o rafaga contra una pared de prueba; `time=4` congela la acumulacion de manchas. Compatible con `skin=`.

Estas herramientas son una ayuda visual; no reemplazan las pruebas automatizadas ni la medición de rendimiento en un dispositivo físico.

## Visor del compañero

`http://localhost:5173/tools/viewers/player-viewer.html` compara el soldado GLB
de pie, agachado y tumbado, con movimiento, ADS, disparo y recarga. El enlace
«Modelo de reserva» (`?fallback=1`) revisa las mismas posturas sin el GLB.
La camara orbital permite comprobar silueta, suelo y orientacion del arma.

## Visor de mapas

`map-viewer.html` construye un mapa de Zombies con el render del juego, abre todas las puertas de pago y lo muestra desde una cámara fija, con luces, parpadeos y polvo animados. Sirve para revisar una zona sin jugar hasta ella.

- `http://localhost:5173/tools/viewers/map-viewer.html?map=station-33&cam=5.6,1.65,3.5&look=6.5,1.5,-8`: la puerta de las cocheras vista desde el vestíbulo.
- Parámetros: `map=` (id del registro), `cam=x,y,z` y `look=x,y,z`, `fov=`, `quality=low|medium|high`, `doors=0` para dejar las puertas cerradas y `power=1` para accionar el interruptor general del mapa.

## Visor de interacciones

`http://localhost:5173/tools/viewers/interaction-viewer.html` usa el render y CSS reales del HUD para revisar avisos, precios y requisitos sobre fondos claros, oscuros y con detalle. Permite cambiar entre los tres idiomas, teclado y controles tactiles, y repetir la entrada. Respeta la visibilidad guardada en Ajustes > Accesibilidad y el movimiento reducido del sistema.

## Visor de rondas del HUD

`http://localhost:5173/tools/viewers/hud-viewer.html` carga el HTML y controlador reales del HUD. Permite avanzar rondas, saltar a rondas altas, reiniciar en cero y cambiar vida/puntos sin volver a animar las garras. El perfil tactil conserva sus dimensiones y el movimiento reducido sigue la preferencia del sistema.
