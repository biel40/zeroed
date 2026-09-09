# Visores de desarrollo

Estas entradas de Vite son herramientas manuales de revisión visual. No forman parte del juego ni deben importarse desde `src/`.

Inícialas con `npm run dev` y abre las rutas indicadas en el navegador.

## Visor de armas

`weapon-viewer.html` carga un modelo de arma con la iluminación y el tone mapping del juego. Sirve para revisar el encuadre, el modelo en primera persona y las poses hip/ADS sin iniciar una partida.

- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=ak47&view=pov`: compara hip y ADS en primera persona.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=m60&view=external`: muestra las siluetas hip y ADS desde fuera.
- `http://localhost:5173/tools/viewers/weapon-viewer.html?weapon=ak47&view=closeup`: inspecciona el receptor y el cañón. Acepta `pose=ads`, `cam=x,y,z` y `look=x,y,z`.

## Visor de zombies

`zombie-viewer.html` carga al walker con cámara orbital. Sirve para revisar sus clips, acabados, variantes y coste de dibujo de manera aislada.

- `http://localhost:5173/tools/viewers/zombie-viewer.html?compare=1`: compara Shiny con zombies normales.
- `http://localhost:5173/tools/viewers/zombie-viewer.html?shiny=1&night=1`: inspecciona el brillo de Shiny en baja luz.
- Parámetros adicionales: `state=attack`, `time=0.475` y `close=1`.

Estas herramientas son una ayuda visual; no reemplazan las pruebas automatizadas ni la medición de rendimiento en un dispositivo físico.