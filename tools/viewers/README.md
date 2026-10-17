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

## Visor de zombies

`zombie-viewer.html` carga al walker (o a Brutus con `model=brute`) con cámara orbital. Sirve para revisar sus clips, acabados, variantes y coste de dibujo de manera aislada.

- `http://localhost:5173/tools/viewers/zombie-viewer.html?compare=1`: compara Shiny con zombies normales.
- `http://localhost:5173/tools/viewers/zombie-viewer.html?shiny=1&night=1`: inspecciona el brillo de Shiny en baja luz.
- `http://localhost:5173/tools/viewers/zombie-viewer.html?state=death&death=all`: los siete estilos de muerte en fila, en bucle (andar, caer, cadáver). `death=slash` muestra uno solo desde tres ángulos y `time=0.6` congela ese instante de la caída; admite `model=brute`. `electric=1` mantiene los rayos residuales de la ZEUS-77 sobre los cuerpos (la muerte `shock` siempre los lleva).
- Parámetros adicionales: `state=attack`, `time=0.475` y `close=1`.

Estas herramientas son una ayuda visual; no reemplazan las pruebas automatizadas ni la medición de rendimiento en un dispositivo físico.