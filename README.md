# 🔫 Zeroed

**FPS de supervivencia zombi para navegador**, creado con Three.js y TypeScript.
Sobrevive a las rondas, consigue armas y descubre los secretos de cada mapa.

| 🧍 Individual | 🤝 Cooperativo | 🌐 Plataforma |
| --- | --- | --- |
| Burned Mansion y Station 33* | Hasta 2 jugadores en Burned Mansion | Navegador, PWA y Android |

\* Station 33 es solo individual y sigue en desarrollo: temporalmente requiere
un correo de la lista de beta, también con `?map=station-33`. Burned Mansion
sigue abierto. Consulta [acceso de beta](public/beta/README.md).

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
npm run test:affected   # Cambios desde la última validación incremental correcta
npm run test:feature    # Impacto de la rama desde el ancestro común con main
npm run test:full       # Vitest, ambos relays y escritorio
npm run typecheck       # TypeScript
npm run build           # Comprobación y build de producción
```

Para repetir una prueba concreta, usa `npm test -- tests/<archivo>.test.ts`.
`npm test` sigue ejecutando toda la suite de Vitest y acepta sus opciones habituales.

Los modos por impacto incluyen cambios confirmados, preparados, sin preparar y archivos nuevos que Git no ignora. La primera ejecución incremental establece una referencia local si las pruebas pasan. Si falta una referencia fiable o el cambio requiere más cobertura, se ejecuta la suite completa. Para validar una rama, se usa `origin/main` si está disponible.

[GitHub Actions](.github/workflows/tests.yml) ejecuta las pruebas completas y TypeScript en las solicitudes de cambio y los pushes a `main`. Para bloquear merges y promociones a producción hasta que pasen, exige el check `Full regression` en la protección de `main` y en los [Deployment Checks de Vercel](https://vercel.com/docs/deployment-checks). El relay de Cloudflare se prueba en Ubuntu porque el runtime local de Wrangler requiere una versión de glibc superior a la de la imagen de build de Vercel.

## 📚 Más información

- [Cambios recientes](docs/changes/)
- [Sistemas de juego](docs/GAME_SYSTEMS.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Línea base de rendimiento](docs/PERFORMANCE_BASELINE.md)
- [Cooperativo y servidor](docs/MULTIPLAYER.md)
- [PWA](docs/PWA.md) · [Android](docs/ANDROID_DOCS.md)
