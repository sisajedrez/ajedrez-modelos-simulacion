# frontend — Ajedrez UNViMe (Vite + React, Atomic Design)

> **Propuesta de Gestión de la Configuración, pendiente de confirmación del equipo de Frontend.**
> Las carpetas están creadas con `.gitkeep` para fijar la estructura: Frontend decide el lenguaje
> (`.jsx` o `.tsx`), el gestor de paquetes, el router y el formato de estilos. Cuando se confirme,
> se ejecuta el scaffolding de Vite **dentro de esta carpeta** y se conserva `src/`.

| Dato | Valor |
|---|---|
| URL local | `http://localhost:5173` |
| Backend consumido | `http://127.0.0.1:3001` (variable `VITE_API_URL`, ver `.env.example`) |
| Diseño | `05 · Diseño Gráfico & UX` (Perla Quispe) · tokens en `src/styles/tokens.css` |
| Tablero | librería `react-chessboard` (especificación de UX) |
| Valores de entorno y puesta en marcha | `docs/documento-GC.md` §3.3 y §6 |

## 1. Capas

```
src/
├── components/
│   ├── atoms/        Elementos indivisibles. Sin lógica de negocio.
│   ├── molecules/    Grupos pequeños de átomos con una sola función.
│   ├── organisms/    Secciones completas de la interfaz.
│   └── templates/    Distribución de pantalla (layout) con huecos; sin datos.
├── pages/            Una por ruta. Piden datos, manejan estado y rellenan una plantilla.
├── hooks/            Lógica reutilizable (reloj, partida en curso, historial).
├── services/         Llamadas HTTP al backend. Único lugar donde se hace fetch.
├── utils/            Funciones puras (formatear tiempo, traducir resultados).
├── styles/           tokens.css y estilos globales.
└── assets/           fonts/ e images/.
tests/                Espeja la estructura de src/ (atoms, molecules, organisms, templates, pages).
```

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
- Una carpeta por componente, en PascalCase y en español: `Boton/Boton.jsx` + `Boton/index.js` (+ estilos junto al componente).
- Las pruebas van en `tests/<capa>/<Componente>.test.jsx`.
- Todo cambio de estructura entra por PR con la etiqueta `cambio-de-interfaz` y actualiza este archivo y `docs/documento-GC.md` §10.2.

## 3. Inventario de componentes

La columna "Origen" indica de qué documento sale cada pieza. Nada se agregó sin origen.

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
| `Modal` | Contenedor de diálogo con fondo oscurecido | CU-06, CU-03 3a |
| `TiempoReloj` | Muestra un tiempo con formato `15:00` | UX: placas de jugador |
| `FondoParticulas` | Animación de partículas flotantes del fondo | UX: Menú |

### Moléculas (`components/molecules/`)

| Componente | Compuesto por | Origen |
|---|---|---|
| `GrupoOpciones` | `Texto` + varios `BotonOpcion`. Se usa para modo, dificultad, color y tiempo. **Reemplaza a `SelectorModo` del árbol original.** | UX: Configuración, CU-01 |
| `PlacaJugador` | `Texto` (nombre o alias) + `TiempoReloj` | UX: "Jugador 1 / Jugador 2 15:00" |
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
| `Tablero` | Envuelve `react-chessboard`: posición (FEN), orientación, destinos legales resaltados, bloqueo al terminar. Con `interactivo=false` es el tablero decorativo del menú. **Es el `Tablero` del árbol original.** | UX, CU-06 |
| `MenuPrincipal` | "¡Bienvenido!", `Titulo` y los botones de navegación (Nueva Partida, Historial, Reanudar) | UX: Menú, CU-05 |
| `CintaParticipantes` | Franja inferior con los participantes pasando de izquierda a derecha | UX: Menú |
| `PanelConfiguracion` | Modo, alias, dificultad, color y tiempo en una sola pantalla; "Comenzar" aparece cuando todo está elegido | UX: Configuración, CU-01 |
| `ListaJugadas` | Lista de `ItemJugada` de la partida en curso o reproducida | QA PF-03 paso 10 |
| `VisorPGN` | `ListaJugadas` + `ControlesReproduccion` | CU-05 paso 4 |
| `FiltrosHistorial` | `CampoFiltro` por ELO/dificultad, modo y estado/resultado | CU-05 paso 3 |
| `ListaPartidas` | `FilaPartida` + estados vacíos | CU-05 |
| `ModalPromocion` | Elegir pieza de coronación | CU-06 paso 3 |
| `ModalResultado` | Resultado final y motivo (mate, tablas, abandono) | CU-02/03/04, RN-03 |
| `ModalErrorMotor` | Falla del motor con "Reintentar" y "Pausar" | CU-03 flujo 3a |

### Plantillas (`components/templates/`) y páginas (`pages/`)

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
| 4 | Lenguaje (JS o TS), gestor de paquetes, router y formato de estilos | Frontend |
| 5 | Importar PGN (corrección del profesor): sin caso de uso ni endpoint todavía. Se agregaría un organismo cuando se defina. | Requisitos, Diseño Técnico |
