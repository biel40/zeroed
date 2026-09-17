# 🧟 Zeroed

FPS Zombies para navegador inspirado en el ritmo arcade de los zombies de CoD clásicos. Sobrevive a las rondas, mejora tu arsenal, y explora los secretos de "Burned Mansion".

## 🛠️ Stack

TypeScript estricto, Three.js, Vite, Vitest, Web Audio API y Capacitor.

## 🚀 Inicio rápido

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para comprobar cambios:

```bash
npm run typecheck
npm run test
```

## 🎮 Juego

- 🏚️ **Burned Mansion**: una mansión en ruinas con rutas, puertas, barreras, compras de pared y secretos.
- 💰 Rondas de Zombies con economía, salud, inventario de dos armas y un cuchillo..
- 🧟‍♂️ Enemigos normales, shiny y "brutus" con combate cuerpo a cuerpo.
- 📱 PWA instalable y empaquetado Android mediante Capacitor.

## 🕹️ Controles

| Entrada | Acción |
| --- | --- |
| `WASD` / ratón | Movimiento y cámara |
| `LMB` / `RMB` | 🔫 Disparar / apuntar |
| `R` / `X` | 🔄 Recargar / cambiar modo de fuego |
| `1` `2` / `3` | 🔪 Cambiar arma / Knife |
| `E` | 🚪 Interactuar, comprar y reparar |
| `Space` / `ESC` | ⏸️ Saltar / pausa |

Los controles táctiles se adaptan automáticamente en móvil.

## 📜 Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia Vite en desarrollo |
| `npm run test` | Ejecuta la suite Vitest |
| `npm run typecheck` | Comprueba TypeScript estricto |
| `npm run build` | Genera la versión de producción |
| `npm run android:run` | Sincroniza e instala una build Android de depuración |

## 📚 Documentación

- [Cambios relevantes](docs/changes/)
