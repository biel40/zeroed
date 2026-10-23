# 🔫 Zeroed

**FPS de supervivencia zombi para navegador**, creado con Three.js y TypeScript.
Sobrevive a las rondas, consigue armas y descubre los secretos de cada mapa.

| 🧍 Individual | 🤝 Cooperativo | 🌐 Plataforma |
| --- | --- | --- |
| Burned Mansion y Station 33* | Hasta 2 jugadores en Burned Mansion | Navegador, PWA y Android |

\* Station 33 está disponible en acceso beta y solo para un jugador.

## 🚀 Empezar

Necesitas Node.js y npm. Desde la raíz del proyecto:

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) y pulsa **START**.
Para jugar en cooperativo local, inicia también `npm run multiplayer:server`
en otra terminal; más detalles en la [guía multijugador](docs/MULTIPLAYER.md).

## 🎮 Controles de teclado y ratón

| Teclas / ratón | Acción |
| --- | --- |
| `W A S D` / ratón | Moverse / mirar |
| Clic izquierdo / derecho | Disparar / apuntar |
| `1` / `2` / `3` | Cambiar arma / cuchillo |
| `R` / `X` | Recargar / cambiar modo de fuego |
| `E` | Interactuar |
| `Espacio` / `Esc` | Saltar / pausa |

## 🧰 Desarrollo

```bash
npm run test       # Tests
npm run typecheck  # TypeScript
npm run build      # Comprobación y build de producción
```

## 📚 Más información

- [Cambios recientes](docs/changes/)
- [Sistemas de juego](docs/GAME_SYSTEMS.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Cooperativo y servidor](docs/MULTIPLAYER.md)
- [PWA](docs/PWA.md) · [Android](docs/ANDROID_DOCS.md)
