# Walker original y Shiny reconocible

**Que**: se restaura el walker low-poly original elegido por el usuario, con su
textura, rig, clips y atribucion a Quaternius. Los normales comparten tinte;
Shiny es dorado, emisivo y tiene diez estrellas animadas. Brute conserva su
modelo y pasa a un unico tinte base. No cambian armas, IA, spawn, dano ni balance.

**Por que**: el rediseño procedural se descarto por su aspecto de humano generico.
Las variaciones sutiles de color impedían distinguir Shiny con claridad.

**Donde**: `ZombieVisual.ts`, `ShinyStars.ts`, GLB walker, tests de assets y
visuales, visor y catalogo de assets. Se retira el generador Walker y su comando;
`generate:zombies` solo regenera Brute para no sobrescribir el modelo restaurado.

**Rendimiento**: Walker tiene 2116 triangulos, un material y 694500 bytes. Cada
Shiny suma una llamada de dibujo y diez puntos, con textura procedural 32x32
compartida y buffers fijos. Normales no dibujan estrellas; no hay luces nuevas.

**Aprendido**: las estrellas deben seguir el torso animado, no el origen del
zombie: el clip original desplaza el cuerpo respecto al root. Muerte, opacidad y
reciclaje limpian el efecto; dt cero y pausa conservan su fase. Las pruebas Node
usan un sustituto de decodificacion de textura al cargar el GLB; la textura real
se revisa en navegador. La suite global conserva un fallo ajeno de Brute en la
escalera del bunker.