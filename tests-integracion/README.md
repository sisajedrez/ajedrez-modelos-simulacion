# Suite de Pruebas de Integración y QA — Sistema de Ajedrez

Este directorio centraliza las herramientas de prueba automatizadas de integración (pruebas de caja negra contra la API REST), los conjuntos de datos de entrada (fixtures) y los registros de evidencia de ejecución para el módulo de PGN, validación de reglas de negocio y ciclo de vida de partidas.

---

## 1. Propósito

El objetivo principal de esta suite es garantizar la consistencia, robustez e interoperabilidad del backend de ajedrez mediante:
- **Validación de reglas oficiales (FIDE):** Comprobación de movimientos legales, enroques, jaques, jaque mate, tablas y promociones.
- **Módulo PGN (Importación / Exportación):** Validación de sintaxis estándar, compatibilidad con partidas provenientes de plataformas externas (como Lichess), soporte de metadatos/cabeceras y control ante entradas maliciosas o corruptas.
- **Ciclo de vida y persistencia:** Pruebas de interrupción, persistencia de estados y reanudación de partidas en curso.

---

## 2. Requisitos Previos

- **Node.js** (versión 18 o superior).
- **Backend en ejecución:** Las pruebas interactúan vía HTTP contra la API REST (por defecto configurada en `http://127.0.0.1:3001`).
- *(Opcional para verificación offline de secuencias)*: Instalar `chess.js` si se desea ejecutar el validador estático local (`npm install chess.js`).

---

## 3. Estructura del Directorio

```text
tests-integracion/
├── pgn-QA/                     # Suite de pruebas para importación/exportación PGN
│   ├── casos/                  # Archivos .pgn clasificados para pruebas
│   ├── exportados/             # PGNs generados automáticamente por el backend
│   ├── indice-pgn.json         # Matriz de casos esperados y criterios de validación
│   ├── INT-03-continuar.json   # Secuencia de jugadas para reanudar partida importada
│   └── probar-pgn.mjs          # Script ejecutor de pruebas de PGN
├── secuencias-QA/              # Suite de pruebas de reglas y jugadas en la API
│   ├── *.json                  # Secuencias de jugadas por caso (RN-*, PF-*)
│   ├── indice.json             # Catálogo y expectativa de resultados por caso
│   ├── jugar.mjs               # Script que reproduce jugadas vía HTTP contra la API
│   └── verificar.mjs           # Validador de secuencias contra motor chess.js
├── EST-01-datos/               # Casos de prueba de persistencia y estado
│   ├── EST-01-parte1.json      # Fase 1: Creación, jugadas previas y pausa
│   └── EST-01-parte2.json      # Fase 2: Reanudación y resolución de partida
├── evidencia-pgn.txt           # Registro de ejecución crudo del módulo PGN
├── evidencia-API-reglas.txt    # Registro de ejecución crudo de reglas de negocio
└── README.md                   # Esta documentación
```

### Detalle de Componentes

### `pgn-QA/`
Contiene los casos de prueba de importación (`POST /games/import`) y exportación (`GET /games/:id/pgn`):
- **`casos/`**:
  - **Casos válidos:** Partidas estándar con metadatos completos y mates canónicos (ej. `PF-IMP-01_valido.pgn`).
  - **Casos de error de sintaxis y reglas:** Movimientos ilegales, sintaxis rota, textos no compatibles y cabeceras incompletas (`PF-IMP-02a` a `PF-IMP-02d`).
  - **Casos reales Lichess:** Partidas con anotaciones avanzadas, variantes y comentarios (`PF-IMP-03_lichess-comentarios-variantes.pgn`).
  - **Casos especiales:** Partidas sin cabeceras (`EXTRA_sin-cabeceras.pgn`) o en curso (`INT-03_en-curso.pgn`).
- **`exportados/`**: Directorio de salida donde se almacenan automáticamente los archivos `.pgn` descargados de la API tras cada prueba exitosa.
- **`probar-pgn.mjs`**: Runner automatizado en Node.js que recorre `indice-pgn.json`, envía cada archivo PGN a la API, audita el código de respuesta HTTP recibido y descarga la partida para verificar su exportación.

### `secuencias-QA/`
Orientado a evaluar la lógica de juego y respuesta de la API (`POST /games/:id/moves`):
- **Archivos `.json`:** Ficheros con matrices de movimientos (`from`, `to`, `promotion`) mapeados a requerimientos específicos de reglas (enroque corto/largo, bloqueo de jaque, etc.).
- **`jugar.mjs`**: Script que orquesta la creación de partidas y el envío secuencial de jugadas, verificando los estados resultantes (`EN_PROGRESO`, `FINALIZADA`, etc.).
- **`verificar.mjs`**: Validador analítico offline para asegurar que los movimientos definidos en los JSON sean 100% legales antes de impactar el backend.

### `EST-01-datos/`
Conjunto de datos estructurado para validar la reanudación y persistencia de partidas:
- **`EST-01-parte1.json`**: Ejecuta una serie de movimientos y pone la partida en pausa (`POST /games/:id/pause`).
- **`EST-01-parte2.json`**: Reanuda la partida existente mediante su identificador (`POST /games/:id/resume`) y completa las jugadas restantes.

### Archivos de Evidencia
- **`evidencia-pgn.txt`**: Captura de salida completa de la consola generada por `probar-pgn.mjs`. Registra los tiempos de respuesta (ms), códigos HTTP devueltos (`201 Created`, `400 Bad Request`, `422 Unprocessable Entity`), deltas de partidas creadas en base de datos y contenido exportado.
- **`evidencia-API-reglas.txt`**: Registro de salida de `jugar.mjs` al correr las matrices de reglas (`RN-*`), documentando la aceptación o rechazo de cada jugada y la coherencia del tablero (FEN y notación SAN).

---

## 4. Guía de Ejecución

> **Nota:** Todos los comandos deben ejecutarse desde la carpeta `tests-integracion/` con el backend iniciado previamente en otra terminal.

### 4.1. Pruebas de PGN (Importación / Exportación)

```bash
# Ejecutar toda la suite de casos definidos en indice-pgn.json
node pgn-QA/probar-pgn.mjs

# Ejecutar un caso específico por su identificador
node pgn-QA/probar-pgn.mjs PF-IMP-01

# Exportar manualmente una partida existente a la carpeta exportados/
node pgn-QA/probar-pgn.mjs --exportar <ID_DE_LA_PARTIDA>

# Especificar una URL base alternativa para el backend
node pgn-QA/probar-pgn.mjs --base http://localhost:8080
```

### 4.2. Pruebas de Reglas de Negocio y Secuencias de Jugada

```bash
# Ejecutar un caso puntual de reglas (ej. validación de enroque)
node secuencias-QA/jugar.mjs RN-02B-1a

# Ejecutar contra una partida ya existente
node secuencias-QA/jugar.mjs RN-02B-1b --partida <ID_DE_LA_PARTIDA>
```

### 4.3. Pruebas de Pausa y Reanudación de Partidas (EST-01)

```bash
# Paso 1: Iniciar partida, jugar primera parte y pausar
node secuencias-QA/jugar.mjs --archivo EST-01-datos/EST-01-parte1.json --pausar

# Paso 2: Reanudar la misma partida pasando el ID obtenido en el Paso 1
node secuencias-QA/jugar.mjs --archivo EST-01-datos/EST-01-parte2.json --partida <ID_DE_LA_PARTIDA> --reanudar
```

### 4.4. Actualización de Logs de Evidencia

Para refrescar los archivos de auditoría y evidencia tras una nueva ejecución:

```bash
# Regenerar evidencia de PGN
node pgn-QA/probar-pgn.mjs > evidencia-pgn.txt

# Regenerar evidencia de reglas de API (PowerShell / Bash)
node secuencias-QA/jugar.mjs RN-02B-1b > evidencia-API-reglas.txt
```

---

## 5. Criterios de Validación de QA

Una ejecución se considera **exitosa** si:
1. **Casos válidos de PGN:** Retornan `HTTP 201`, incrementan el conteo de partidas y permiten una reexportación idéntica en `exportados/` (`HTTP 200`).
2. **Casos inválidos de PGN:** Retornan `HTTP 400` o `HTTP 422`, impidiendo la creación de registros fantasma en la base de datos.
3. **Movimientos legales:** Retornan `HTTP 200` y actualizan la cadena FEN y notación SAN esperada.
4. **Movimientos ilegales:** Retornan `HTTP 422` con código de error `ILLEGAL_MOVE`.
5. **Reanudación:** El estado de la partida pasa correctamente entre `EN_PROGRESO` y `PAUSADA` sin pérdida de historial ni alteración de turnos.