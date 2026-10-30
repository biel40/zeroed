# Sangre en los bordes de ventanas

Retirar los bloqueos exclusivos del jugador de `GibWalls` evita manchas en el
centro vacio de una ventana, pero no basta: al aplanarse, la gota se ensancha
y puede sobresalir desde el dintel, el alfeizar o una jamba.

`GibWallFrame` conserva la cara contactada y ajusta la posicion y extension
de toda la mancha a esa superficie, tambien en impactos rasantes. La misma
regla se aplica a `ZombieBlood` y al Barrett mediante `BloodDropMotion`, sin
objetos temporales por fotograma. Los tests cubren ambos ejes, ambos sentidos,
los cuatro bordes y los vertices que escribe el pool de sangre.

El ajuste visual posterior reduce cantidad, radio y dispersion de las heridas,
limita la expansion y el grosor al adherirse, y deforma la geometria compartida
dentro de su envolvente original. No aumenta triangulos ni draw calls. El
Barrett mantiene sus restos con sangre y niebla mas discretas.

## Manchas que parecian agujeros

Dos causas en las columnas del vestibulo de Station 33. Su proxy unico tenia el
ancho del zocalo (8 cm mas por lado que el fuste), asi que las manchas quedaban
flotando delante del marmol y asomaban por las aristas; ahora zocalo y fuste
tienen proxies separados con la misma huella para el jugador. Ademas, la esfera
aplastada conservaba las normales suaves del borde y se iluminaba como un
crater; `bloodMaterial` usa sombreado plano. Sin ese brillo y tras el recorte
anterior la sangre apenas se leia en superficies oscuras: se recupero parte de
la cantidad y del tamano de las manchas, y el material es algo mas rojo y
humedo. Un test fija el tamano minimo de la herida de bala mas leve.

El resto de proxies de mobiliario son cajas acolchadas: casi todos sobresalen
por los lados y varios (bancos, carros, bidones, rejas, rampa del bunker)
tampoco tienen una tapa real. Cada colisionador declara ahora `stainFaces`;
en una cara sin superficie la gota resbala al suelo o, si es una tapa,
desaparece. Se eligio declararlo por proxy en lugar de medir la geometria en
tiempo de ejecucion: el test de contrato mide con raycasts y obliga a marcar
los proxies nuevos que no coincidan.
