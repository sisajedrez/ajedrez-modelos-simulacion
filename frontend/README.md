# frontend — Ajedrez UNViMe (Vite + React, Atomic Design)

> **Decisiones adoptadas por Frontend:** Vite + React, JavaScript (`.jsx`), **pnpm** (como Backend, GC D-04),
> CSS plano con tokens en `src/styles/tokens.css` y **sin router** por ahora: `PaginaAjedrez` maneja el flujo
> en una sola página hasta que el equipo cierre las rutas definitivas.

| Dato | Valor |
|---|---|
| URL local | `http://localhost:5173` |
| Backend consumido | `http://127.0.0.1:3001` (variable `VITE_API_URL`, ver `.env.example`) |
| Diseño | `05 · Diseño Gráfico & UX` (Perla Quispe) · tokens en `src/styles/tokens.css` |
| Tablero | librería `react-chessboard` (especificación de UX) |
| Valores de entorno y puesta en marcha | `docs/documento-GC.md` §3.3 y §6 |

## Puesta en marcha

Requisitos: Node 24 LTS (ver `.nvmrc` en la raíz), pnpm 10 (vía Corepack) y el backend corriendo en `http://127.0.0.1:3001`
con PostgreSQL y Stockfish configurados. En el `.env` del backend, `FRONTEND_URL` tiene que ser **exactamente** el origen del
front (`http://localhost:5173`): si abrís el front como `http://127.0.0.1:5173`, el backend rechaza las llamadas por CORS.

```bash
pnpm --dir frontend install
cp frontend/.env.example frontend/.env     # ajustar VITE_API_URL si el backend no está en 3001
pnpm --dir frontend dev                    # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compila a `dist/` |
| `pnpm preview` | Sirve lo compilado |
| `pnpm lint` | ESLint |
| `pnpm test` | Pruebas unitarias (`node:test`) |

El modo "vs Jugador" necesita igualmente el backend (crea la partida con `mode: LOCAL`). Los niveles de dificultad se leen de
`GET /difficulty-profiles`: sin backend no se pueden elegir y "Comenzar" queda deshabilitado en vs Stockfish y vs IA.

## Qué está conectado al backend

| Pantalla / acción | Endpoint |
|---|---|
| Niveles de dificultad | `GET /difficulty-profiles` |
| Comenzar partida | `POST /games` `{ mode: LOCAL\|STOCKFISH\|AI, alias, difficulty: FACIL\|MEDIO\|DIFICIL, playerColor: WHITE\|BLACK }` (con el motor de blancas, el backend juega su primera jugada al crear la partida) |
| Elegir pieza (destinos legales) | `GET /games/:id/legal-moves?square=e2` |
| Mover | `POST /games/:id/moves` `{ from, to, promotion? }` |
| Turno de Stockfish / IA | `POST /games/:id/engine-move` |
| Rendirse | `POST /games/:id/resign` `{ color }` |
| Guardar y salir | `POST /games/:id/pause` |

Capa HTTP: `src/services/`. Los nombres de campo del backend están solo en `src/services/normalizar.js`; los valores
`LOCAL | STOCKFISH | AI` y `WHITE | BLACK`, en `src/utils/traductores.js`; los mensajes por código de error, en `src/utils/mensajesError.js`.

## Pendiente

- Historial de partidas, visor PGN y reanudar (`GET /games`, `/games/:id/pgn`, `/resume`): falta el diseño de UX.
- Reloj: se muestra el tiempo elegido pero no hay cuenta regresiva; ningún requisito lo pide (decisión abierta 3).
- Vs Jugador: la API recibe un único `alias`; el nombre del segundo jugador solo se ve en pantalla.
- `GET /games/:id` devuelve `result` pero no `endReason`; para el historial habrá que pedirle a Backend que lo agregue.
- Pruebas de componentes (Vitest + Testing Library): decisión abierta del equipo.

## 1. Capas

```
src/
├── components/
│   ├── atoms/        Un directorio PascalCase por átomo.
│   ├── molecules/    Un directorio PascalCase por molécula.
│   ├── organisms/    Un directorio PascalCase por organismo.
│   └── templates/    Un directorio PascalCase por plantilla, sin datos ni lógica.
├── pages/
│   └── PaginaAjedrez/ Estado del flujo actual y composición de las plantillas.
├── hooks/            Lógica reutilizable cuando la necesite más de una página.
├── services/         Único lugar para llamadas HTTP: `clienteApi` (fetch + errores), `partidasApi` (un método por endpoint) y `normalizar` (único lugar que conoce los nombres de campo del backend).
├── utils/            Funciones puras independientes de React.
├── styles/           Tokens de diseño y estilos globales.
└── assets/           Recursos estáticos.
tests/                Pruebas por capa y tests/utils para funciones puras.
```

Cada componente se guarda en `Capa/NombreEnPascalCase/NombreEnPascalCase.jsx` y se exporta
desde `index.js`. Los estilos compartidos usan tokens de `src/styles/tokens.css`.

## 2. Reglas

**Dependencias (solo hacia abajo)**

| Capa | Puede importar |
|---|---|
| `atoms` | nada del proyecto (solo `styles/` y `utils/`) |
| `molecules` | `atoms` |
| `organisms` | `atoms`, `molecules` y otros `organisms` |
| `templates` | `atoms`, `molecules`, `organisms` |
| `pages` | todo lo anterior, `hooks` y `services` |

**Responsabilidades**
1. Fuera de `pages/` y `hooks/` nadie llama a `services/`: los componentes reciben todo por props. Así un átomo o un organismo se prueba sin backend.
2. La autoridad sobre las reglas de ajedrez es el backend (SAD §3): los destinos legales y la validación definitiva salen de `GET /games/:id/legal-moves` y `POST /games/:id/moves`. El SAD permite una copia ligera de `chess.js` en el frontend, pero solo para feedback visual inmediato.
3. Colores, fuentes y radios salen de `tokens.css`, nunca escritos a mano.
4. Textos de la interfaz en español.

**Cómo clasificar un componente nuevo** (para no discutirlo en cada PR)
- ¿Se puede dividir en piezas que tengan sentido solas? **No** → átomo.
- ¿Es un grupo de átomos que cumple una sola función (etiqueta + campo, botón + icono)? → molécula.
- ¿Es una sección que el usuario reconoce como parte de la pantalla (panel, lista, modal, tablero)? → organismo.
- ¿Solo ubica regiones de la pantalla y no sabe qué contienen? → plantilla.
- ¿Tiene una ruta propia y pide datos? → página.

**Convenciones**
- Una carpeta por componente, con nombre PascalCase en español: `Boton/Boton.jsx` +
  `Boton/index.js` (y estilos junto al componente cuando sean exclusivos).
- Los componentes reciben datos y callbacks por props; no consultan servicios.
- Las pruebas de componentes van en `tests/<capa>/<Componente>.test.jsx`. Las funciones puras
  pueden probarse en `tests/utils/`.
- Todo cambio de estructura entra por PR con la etiqueta `cambio-de-interfaz` y actualiza este archivo y `docs/documento-GC.md` §10.

## 3. Inventario de componentes

La columna "Origen" indica de qué documento sale cada pieza. El inventario también conserva
componentes previstos que no forman parte de la interfaz de referencia actual; todavía no se
implementan historial, visor PGN, reanudar partidas ni reloj. Ya están conectados al backend: nueva partida, jugadas legales, turno de la máquina, rendición, coronación, error/timeout del motor y "Guardar y salir".

### Átomos (`components/atoms/`)

| Componente | Qué es | Origen |
|---|---|---|
| `Boton` | Botón base, variante "vidrio difuso" (`--color-vidrio`) | UX: Menú, Configuración |
| `BotonOpcion` | Botón seleccionable (ej. "vs Stockfish", "Blancas", "15 min") con estado activo | UX: Configuración |
| `Texto` | Texto en Jersey 15 | UX |
| `Titulo` | "Ajedrez UNViMe" en Jersey 20, con sombra y contorno negro | UX: Menú |
| `CampoTexto` | Input de una línea | CU-01 (alias) |
| `Selector` | Lista desplegable | CU-05 (filtros) |
| `Insignia` | Etiqueta de estado o resultado (En curso, Pendiente, Finalizada, Victoria, Tablas) | CU-05, RN-01 |
| `Icono` | Iconos de interfaz (flechas, cierre) | CU-05 (controles) |
| `IconoPieza` | Imagen de una pieza para mostrar fuera del tablero | CU-06 (promoción) |
| `Cargando` | Indicador de espera | CU-03/04 (turno de la máquina) |
| `Modal` | Contenedor de diálogo accesible con fondo oscurecido (cierra con Escape) | CU-06, CU-03 3a |
| `TiempoReloj` | Muestra un tiempo con formato `15:00` | UX: placas de jugador |
| `FondoParticulas` | Animación de partículas flotantes del fondo | UX: Menú |

### Moléculas (`components/molecules/`)

| Componente | Compuesto por | Origen |
|---|---|---|
| `GrupoOpciones` | `Texto` + varios `BotonOpcion`. Se usa para modo, dificultad, color y tiempo. **Reemplaza a `SelectorModo` del árbol original.** | UX: Configuración, CU-01 |
| `PlacaJugador` | `Texto` (nombre o alias) + `TiempoReloj` | UX: "Jugador 1 / Jugador 2 15:00" |
| `BotonRendirse` | `Boton` + `Icono` para rendir una partida. *Agregado: no estaba en el inventario original.* | UX: controles de partida |
| `CampoAlias` | `Texto` + `CampoTexto` + mensaje de error | CU-01 paso 4 |
| `CampoFiltro` | `Texto` + `Selector` | CU-05 paso 3 |
| `FilaPartida` | `Texto` (fecha, alias, modo, dificultad, jugadas) + `Insignia` | CU-05 paso 2 |
| `ItemJugada` | número + `Texto` con la jugada en SAN | RN-01, CU-05 |
| `ControlesReproduccion` | 4 `Boton` con `Icono`: inicio, anterior, siguiente, fin | CU-05 paso 4 |
| `OpcionPromocion` | `IconoPieza` + `Texto` (Dama, Torre, Alfil, Caballo) | CU-06 paso 3 |
| `Aviso` | `Icono` + `Texto` (jugada inválida, base vacía, sin coincidencias) | CU-06 2a, CU-05 2a/3a |
| `AccionesPartida` | `Boton` "Guardar y Salir" + `Boton` "Rendirse" | CU-02/03/04 2a, RN-03 |

### Organismos (`components/organisms/`)

| Componente | Función | Origen |
|---|---|---|
| `Tablero` | Envuelve `react-chessboard`; admite posición y orientación. Es interactivo por clic (casilla de origen y destino); los destinos legales salen de `GET /games/:id/legal-moves` y la orientación usa la opción nativa `boardOrientation`. **Es el `Tablero` del árbol original.** | UX, CU-06 |
| `MenuPrincipal` | "¡Bienvenido!", `Titulo` y el inicio de una nueva partida. Historial y reanudar quedan pendientes. | UX: Menú, CU-05 |
| `CintaParticipantes` | Franja inferior con los participantes pasando de izquierda a derecha | UX: Menú |
| `PanelConfiguracion` | Modo, alias, dificultad, color y tiempo en una sola pantalla; "Comenzar" aparece cuando todo está elegido | UX: Configuración, CU-01 |
| `ListaJugadas` | Jugadas en pares ("1. e4 e5") y el botón "Guardar y salir" | QA PF-03 paso 10 |
| `ModalPromocion` | Elegir pieza de coronación (Dama, Torre, Alfil, Caballo) | CU-06 paso 3 |
| `ModalResultado` | Resultado real (jaque mate, abandono, tablas…), ID de partida, revisión y regreso al menú | CU-02/03/04, RN-03 |
| `ModalRendicion` | Confirmación de abandono; permite cancelar o rendirse. *Agregado: no estaba en el inventario original.* | CU-02/03/04 2a, RN-03 |
| `ModalAviso` | Aviso con acciones: falla del motor ("Reintentar" / "Guardar y salir"), errores de la API y partida guardada. **Cubre `ModalErrorMotor`.** | CU-03 flujo 3a |
| `VisorPGN` | `ListaJugadas` + `ControlesReproduccion` | CU-05 paso 4 |
| `FiltrosHistorial` | `CampoFiltro` por ELO/dificultad, modo y estado/resultado | CU-05 paso 3 |
| `ListaPartidas` | `FilaPartida` + estados vacíos | CU-05 |

### Plantillas (`components/templates/`) y páginas (`pages/`)

Mientras siga pendiente la decisión de router, `PaginaAjedrez` administra el flujo del prototipo
en una sola página y compone las plantillas disponibles. Las rutas de la tabla siguen siendo propuestas.

| Plantilla | Distribución | Página | Ruta (propuesta) |
|---|---|---|---|
| `PlantillaMenu` | fondo + tablero decorativo + contenido central + cinta inferior | `PaginaMenu` | `/` |
| `PlantillaConfiguracion` | panel a la izquierda + tablero a la derecha | `PaginaConfiguracion` | `/nueva-partida` |
| `PlantillaPartida` | placa del oponente, tablero, placa del jugador y panel lateral | `PaginaPartida` | `/partida/:id` |
| `PlantillaHistorial` | filtros + lista | `PaginaHistorial` | `/historial` |
| `PlantillaPartida` (con `VisorPGN` en el lateral) | igual que la partida, sin acciones de juego | `PaginaVisor` | `/historial/:id` |

## 4. Decisiones abiertas

| # | Tema | Quién decide |
|---|---|---|
| 1 | UX muestra dos versiones de la configuración: una sola pantalla (la que describe) y un asistente paso a paso con transiciones. El inventario cubre la de pantalla única; el asistente reutilizaría `GrupoOpciones`. Si se elige el asistente, se agrega un organismo `AsistenteConfiguracion`. | UX, Frontend |
| 2 | Faltan wireframes de: historial, visor PGN, modal de promoción, resultado final, error de motor, "Guardar y Salir" y "Rendirse". Los componentes están previstos; el diseño visual lo define UX. | UX |
| 3 | El selector de tiempo (10/15/20 min) y el reloj 15:00 no figuran en ningún requisito. Si no se aprueban, se eliminan `TiempoReloj` y el grupo "Tiempo de partida". | Requisitos, profesor |
| 4 | ~~Lenguaje, gestor de paquetes, router y formato de estilos~~ **Resuelto salvo el router:** JavaScript, pnpm y CSS con tokens. El router sigue abierto (rutas propuestas en la sección 3). | Frontend |
| 5 | Importar PGN (corrección del profesor): sin caso de uso ni endpoint todavía. Se agregaría un organismo cuando se defina. | Requisitos, Diseño Técnico |
