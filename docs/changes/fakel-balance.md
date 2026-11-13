# ФАКЕЛ-33: auditoria y equilibrio basico — 2026-11-13

Primera fase: ajustar la version basica y proponer su perfil KOVKA especifico.
La mejora de 7000 puntos no se implementa. La referencia de comportamiento
vigente queda en [sistemas](../GAME_SYSTEMS.md); esta nota conserva los valores
auditados y el motivo del ajuste.

## Auditoria anterior al ajuste

Fuentes responsables: [definicion](../../src/config/weapons.ts),
[cadencia y municion](../../src/weapons/Weapon.ts),
[calor](../../src/weapons/BarrelHeat.ts),
[orquestacion](../../src/modes/ZombiesFlames.ts),
[seleccion](../../src/zombies/FlameTargeting.ts) y
[quemaduras](../../src/zombies/ZombieBurns.ts).

| Mecanismo | Valor auditado |
| --- | --- |
| Dano directo | 45 por objetivo y disparo, siempre torso; sin bonus de cabeza |
| Cadencia | 750 rpm: 12,5 aplicaciones/s, una cada 0,08 s |
| Dano directo sostenido | 562,5/s por objetivo mientras se alimenta el chorro |
| Quemadura | 120/s durante 4 s desde la ultima aplicacion: hasta 480 residuales |
| Frecuencia DoT | 30 cada 0,25 s; fraccion final si queda tiempo parcial |
| Una aplicacion aislada | 45 + 480 = 525 por objetivo, hasta 6300 entre 12 objetivos |
| Chorro sostenido con DoT | 682,5/s por objetivo, sin contar bloqueos, recargas ni bonus |
| Alcance | 9 m, mas 0,35 m de tolerancia al cuerpo; sin caida de dano por distancia |
| Cono | Semiangulo 0,24 rad (13,75 grados), unos 5,1 m de anchura incluyendo cuerpos a 9 m |
| Objetivos | Hasta 12, los mas cercanos; los cuerpos no cortan el chorro |
| Combustible | 100 en el cristal + 300 de reserva; una unidad por disparo, incluso fallando |
| Autonomia nominal | 8 s/cristal, 32 s totales de fuego efectivo, separados por calor y recarga |
| Recarga | 3,4 s, tanto tactica como vacia; transfiere reserva, no crea combustible |
| Calor | 50 disparos hasta bloquear, unos 4 s; aviso al 75 %, unos 0,96 s antes |
| Enfriamiento | 0,35 s de espera + 3,5 s para recuperar desde el bloqueo |

La seleccion exige un cuerpo vivo en la planta del jugador, dentro del cono.
Paredes y puertas cerradas recortan el alcance del eje y se comprueba tambien
la linea de vision hasta el torso de cada objetivo. El fuego visual y el dano
son sistemas distintos: `Zombie.ignite` presenta; solo `ZombieBurns` aplica DoT.

**No habia acumulacion de quemaduras.** El registro contiene una sola entrada
por zombi. Reencender conserva el reloj del proximo tick y refresca duracion;
mantiene el mayor DPS recibido, sin sumarlo. El dano se calcula al encender
con los multiplicadores de la partida, por lo que una quemadura potenciada
puede mantener ese DPS al refrescarla con una aplicacion mas debil. Los muertos
se eliminan del registro; reset lo vacia y la pausa detiene la simulacion.
Se conservan estas reglas.

Una ignicion no letal nueva paga 10 puntos, sin pagos adicionales por refresco
ni por tick DoT. Las bajas pagan la recompensa normal del arma (50 para un
normal, 100 para Brutus, antes de anillos). No se detecto duplicacion de puntos.

No hay regeneracion pasiva ni reposicion de combustible al cambiar de ronda.
La estacion exige electricidad y cristal de arranque: vende el arma por 3500
y repone por 1750. Tambien funciona el reabastecimiento generico del vestibulo
por 800, que rellena el arma equipada, incluida esta. El anillo Radiante
recupera un 10 % de la reserva inicial del arma equipada cada ocho bajas:
30 unidades para la ФАКЕЛ-33. El anillo de potencia multiplica cadencia por
1,25 y dano por 1,1; aumenta tambien el gasto y la rapidez del recalentamiento.
Cambiar de arma reinicia el calor mediante el contrato comun `Weapon.equip`,
sin restaurar combustible. No se modifican estos sistemas compartidos.
Fuentes: [estaciones y reposicion](../../src/zombies/maps/Station33Config.ts),
[compras](../../src/modes/ZombiesMode.ts),
[anillos](../../src/game/rings/RingCatalog.ts) y
[Radiante](../../src/modes/ZombiesRadiantRing.ts).

### Salud y enemigos

La salud normal es `round(100 * (1 + 3 * (1 - exp(-(r-1)/12)) +
max(0, r-5) * 0,35))`. Desde R6 incorpora 35 HP adicionales por ronda;
no se estabiliza en 400. Shiny conserva la salud normal; Brutus multiplica
por tres antes del redondeo, con un maximo de dos activos desde R5.
La poblacion simultanea global tiene tope 24, asi que un barrido de dos
aplicaciones podia cubrirla entera si el jugador alcanzaba ambos grupos.
Fuentes: [escalado y tipos](../../src/zombies/ZombieConfig.ts),
[spawn y dano](../../src/zombies/ZombieManager.ts).

| Ronda | HP normal / Shiny | HP Brutus | Combustible anterior | Combustible ajustado |
| --- | ---: | ---: | ---: | ---: |
| 5 | 185 | 555 | 1 | 3 |
| 10 | 433 | 1300 | 1 | 8 |
| 20 | 863 | 2590 | 8 | 17 |
| 30 | 1248 | 3745 | 15 | 25 |

Combustible minimo por grupo de hasta 12 normales, agrupados y visibles,
con una rafaga continua sin bonus y dejando actuar toda la quemadura final.
Incluye DoT durante la rafaga. No son tiempos de muerte ni mediciones de
partidas reales. Los valores ajustados estan cubiertos por pruebas de
`Weapon` y `ZombiesFlames`.

Brutus recibe los mismos danos absolutos, con mas salud y la mitad de fuerza
de reaccion. Shiny no tiene resistencia al fuego. No se cambian sus perfiles.
Los impactos no interrumpen persecucion ni ataques: `ZombieStagger` incluye
resistencia y un minimo del 45 % de velocidad. Un test aplica fuego directo y
DoT sostenidos a un zombi real y comprueba que sigue atacando y luego recupera
su paso. No se encontro un aturdimiento permanente que necesitara otra regla.
Fuentes: [dano del zombi](../../src/zombies/Zombie.ts),
[reaccion](../../src/zombies/ZombieStagger.ts).

CAPITAN URSS usa otra ruta: solo recibe los 45 directos por disparo; no se
registra en `ZombieBurns`. El fuego rodea su escudo y cuenta como torso,
incluido el multiplicador x1,5 mientras esta aturdido. Su salud es
`5000 + 350 * (r-1)`. Sus fases, defensas, ataques y dano recibido del chorro
basico se conservan. Su ruta `scorch` comprueba planta, cono y alcance, pero
no repite la comprobacion de obstaculos de la horda: es una limitacion previa
que este ajuste no modifica ni declara resuelta.
Fuentes: [scorch](../../src/modes/ZombiesGuardian.ts),
[cerebro del jefe](../../src/zombies/guardians/CaptainUssrBrain.ts).

### Cooperativo

Station 33 tiene `coop: false`. `fakel` es exclusiva del mapa, fuera del
arsenal de ambos clientes, de la caja y de la precarga compartida. El
cooperativo actual solo carga Burned Mansion; ni anfitrion ni invitado
instancian `ZombiesFlames`. Por tanto, actualmente no hay dano de quemadura
duplicado entre clientes, ni soporte cooperativo del lanzallamas que ajustar.
Se cubre esta frontera con tests. Si se habilita en otra fase, el anfitrion
debera poseer un unico registro de quemaduras y el invitado solo presentar
las igniciones y el dano confirmado; no se habilita esa ruta aqui.
Fuentes: [registro](../../src/config/zombieMaps.ts),
[arsenal cooperativo](../../src/modes/coop/CoopWeapons.ts),
[autoridad](../../src/modes/coop/CoopHostMode.ts).

## Problemas y ajuste implementado

1. **Exceso de dano gratuito tras un roce.** Los 525 de una sola unidad
   eliminaban normales hasta R12 inclusive. Con 12 objetivos simultaneos,
   el problema principal era la conversion de una ignicion minima en una
   eliminacion completa, no una suma accidental de DoT.
2. **El calor apenas limita esa estrategia.** Bastaba aplicar el fuego una vez
   y esperar; no habia que acercarse a los 50 disparos de bloqueo.
3. **Recursos muy baratos por baja.** El coste marginal de la reposicion
   generica es 2 puntos por unidad si faltan las 400. Los perks y el Radiante
   pueden aumentar aun mas esa eficiencia. El ajuste reduce el dano por
   ignicion; no cambia precios ni anillos para evitar afectar a otras armas.
4. **Imprecision temporal reproducida.** Al acumular deltas de 1/30, 1/60 o
   1/120, el octavo tick podia caer despues del segundo 2 por redondeo.
   No aumentaba el dano total, pero hacia menos predecible el instante del
   impacto. Se corrige la comparacion con una tolerancia de 1 ns.

| Parametro | Antes | Basica ajustada |
| --- | ---: | ---: |
| Dano directo / frecuencia | 45 / 0,08 s | Igual |
| DPS de quemadura | 120 | 30 |
| Quemadura residual | 4 s / 480 | 3 s / 90 |
| Tick DoT | 30 / 0,25 s | 7,5 / 0,25 s |
| Aplicacion aislada completa | 525 | 135 (-74,3 %) |
| DPS sostenido por objetivo | 682,5 | 592,5 (-13,2 %) |
| Alcance / cono / objetivos / combustible / calor | Valores auditados | Igual |

Los 90 residuales equivalen a dos impactos directos, frente a mas de diez
antes. Conserva la potencia inmediata contra grupos, pero una sola unidad
solo basta para normales de R1-R2 sin bonus; desde R3 requiere mas combustible.
La duracion de tres segundos deja margen para el perfil mejorado de hasta
cinco sin recuperar los 480 de dano gratuito anteriores. Es un cambio
concentrado en el DoT, sin alterar la IA, el jefe, el inventario ni la forja.
No anade efectos, raycasts, colecciones ni allocations al bucle.

Los bonus existentes siguen siendo relevantes: con Radiante, la recuperacion
puede compensar el gasto de grupos densos incluso tras el ajuste. Su economia
con todos los anillos necesita validacion de juego; no se declara resuelta ni
se altera su contrato en esta fase.

## Propuesta KOVKA, pendiente de validacion e implementacion

**Hallazgo previo:** la forja actual no excluye `fakel`; ya aplica el perfil
generico por 5000 una vez por arma, recarga y duplica el multiplicador comun
de dano, tanto directo como DoT: antes del ajuste, una aplicacion forjada
sumaba hasta 1050. Tras el ajuste basico, eso significa 90
directos y 60/s durante 3 s. Esta fase no cambia esa ruta existente ni activa
el siguiente perfil. Validar el arma basica exige probarla sin forjar.
Fuentes: [estado de mejora](../../src/game/WeaponUpgrades.ts),
[compra y entrega](../../src/modes/ZombiesWeaponUpgrade.ts),
[maquina](../../src/zombies/maps/Station33Config.ts).

| Parametro | Basica ajustada | Propuesta KOVKA |
| --- | ---: | ---: |
| Precio de mejora | — | 7000, exclusivo para `fakel` |
| Mejoras posibles | — | Una por arma y partida |
| Dano directo | 45 | 58,5 (+30 %) |
| Intervalo directo | 0,08 s | 0,08 s |
| Quemadura | 30/s durante 3 s | 30/s durante 5 s, refresco sin suma |
| Residual por ignicion | 90 | 150 |
| Tick DoT | 7,5 cada 0,25 s | Igual |
| Alcance | 9 m | 10,8 m (+20 %) |
| Cono / maximo de objetivos | 0,24 rad / 12 | Igual |
| Consumo por aplicacion | 1 | 1,15 de media (+15 %) |
| Capacidad / reserva | 100 / 300 | Igual |
| Autonomia nominal del cristal | 8 s | Aproximadamente 6,96 s |
| Calor / recarga | Valores auditados | Igual |
| DPS sostenido por objetivo | 592,5 | 761,25 (+28,5 %) |
| Aplicacion aislada completa | 135 | 208,5 |

Se mejora el dano directo y la duracion, conservando el DPS residual para no
recrear la estrategia de barrer y huir. El consumo adicional deja una ganancia
de DPS por combustible de aproximadamente el 11,7 %. El alcance y el DoT mas
largo aportan ventajas adicionales que exigen probarse en juego.

Integracion propuesta, sin un sistema nuevo de mejoras:

- Anadir un perfil opcional por arma a los datos de la maquina, con precio y
  multiplicador propios, y resolverlo en `ZombiesWeaponUpgrade`. Conservar
  `WeaponUpgrades` para la unicidad y el reset. Sin perfil, las otras armas
  mantienen el precio y el multiplicador actuales.
- Para `fakel`, **sustituir** el multiplicador generico x2 por x1,3 directo
  y x1 de quemadura, nunca acumularlos. La escala actual es comun a ambos
  danos: separar la contribucion de mejora al DoT para mantener sus 30/s,
  conservando en ambos los bonus comunes de anillos y ajustes de desarrollo.
  Resolver una sola vez los parametros de llama al entregar la mejora,
  compartiendolos entre seleccion, vista y alcance contra el jefe.
- Usar un acumulador fraccional en la logica pura `Weapon` para el coste
  medio 1,15; conservar el intervalo de 0,08 s. Aumentar rpm alteraria dano,
  calor y consumo a la vez. Validar agotamiento, recarga, pausa, cambio de arma
  y reset sin combustible gratuito ni gasto dependiente de FPS.
- Mantener acabado y reposicion de la entrega existentes. No anadir DoT al
  jefe ni modificar sus reglas de escudo o fases. La ruta cooperativa futura
  seguiria la autoridad unica descrita arriba, sin timers de dano en replicas.

## Verificacion

[Pruebas de llama](../../tests/flameStream.test.ts): coste por grupo en
R5/R10/R20/R30, DoT en 20/30/60/120 FPS, refrescos sin acumulacion ni adelanto
del tick, frames largos y fraccion final, atribucion de bajas, muertos/reset,
paredes, plantas, maximo de objetivos, especiales y ataques bajo fuego.
Las pruebas existentes del jefe comprueban que el chorro sigue rodeando el
escudo con el mismo dano directo; las de la forja cubren la mejora generica.

Resultado de la sesion: typecheck, 93 pruebas dirigidas y ambos relays
(Node y Cloudflare local) correctos. La repeticion completa con dos workers
aprobo 2327 pruebas en 209 archivos, pero Vitest termino con codigo 1 por
tres timeouts internos de RPC `onTaskUpdate`. La ejecucion global no se
declara limpia. Los cuatro timeouts de pruebas de hordas de la primera
ejecucion pasaron al repetirse aislados, sin cambiar sus limites de tiempo.

Validacion manual pendiente por el usuario: probar la basica sin forjar en
R5/R10/R20/R30, horda densa y dispersa, rafaga corta frente a fuego sostenido,
Brutus, CAPITAN URSS, paredes/puertas, aviso y enfriamiento, y combustible con
y sin anillos. Repetir en PC y Android, revisando fluidez y sensacion del arma.
No se automatiza el navegador ni se afirma que el equilibrio subjetivo o el
rendimiento en dispositivos hayan quedado validados.
