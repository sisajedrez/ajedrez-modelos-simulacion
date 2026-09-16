Documento de Gestión de la Configuración (GC)
Proyecto: Sistema de Ajedrez Local con Motores e IA Basada en Datos

Encargado: Facundo Olivera

Referencia: Alineado con Documento de Arquitectura de Software (SAD v1.2 - 15/09/2026) y Especificación de Requisitos (RN-01 a RN-04, CU-01 a CU-06).

1. Control de versiones y repositorio
Usamos Git como sistema de control de versiones, alojado en GitHub.

Repositorio oficial: [https://github.com/sisajedrez/ajedrez-modelos-simulacion.git](https://github.com/sisajedrez/ajedrez-modelos-simulacion.git)

Rama main: Código estable y testeado; representa las entregas formales.

Rama develop: Rama de integración de trabajo diario. Ningún cambio entra directamente a main ni a develop sin pasar por un Pull Request revisado por Tech Lead.

### Estructura de carpetas

```
proyecto-ajedrez/
├── frontend/                  # Next.js
│   ├── components/
│   │   ├── Tablero/
│   │   └── SelectorModo/
│   ├── pages/
│   └── tests/                 # pruebas unitarias frontend
├── backend/                   # Express
│   ├── src/
│   │   ├── controllers/       # rutas: crear partida, enviar jugada, historial
│   │   ├── engines/           # MotorStockfish, MotorIAPropia
│   │   ├── validators/        # ValidadorDeJugada
│   │   ├── models/            # Partida, Jugada, Jugador, ConfiguracionDeDificultad
│   │   └── routes/
│   └── tests/                 # pruebas unitarias backend
├── db/
│   ├── schema.sql             # modelo físico de Modelado de Datos
│   └── seeds/
├── docs/
│   ├── analisis-requisitos.md
│   ├── arquitectura.md
│   ├── diseno-tecnico.md
│   ├── documento-GC.md
│   └── informe-QA.md
├── tests-integracion/         # pruebas de integración (QA)
├── docker-compose.yml         # entorno compartido de pruebas
├── .env.example
└── README.md
```

Convención de RamasRamaUsomainCódigo en producción/entregable. Protegida contra commits directos.developIntegración general de funcionalidades listas para testing conjunto.feature/<nombre-corto>Nuevas funcionalidades (ej. feature/uci-stockfish, feature/repository-moves).fix/<nombre-corto>Corrección de fallos puntuales (ej. fix/timeout-stockfish, fix/fen-normalization).Reglas de contribución:Queda prohibido el commit directo sobre main y develop.Todo cambio se incorpora mediante Pull Request aprobado por el Tech Lead.Principio de responsabilidad única: una rama = una feature o corrección específica.Formato de commits: prefijo semántico en presente (feat:, fix:, docs:, test:, refactor:).Convención de Nomenclatura en Base de Datos (PostgreSQL)ElementoConvenciónEjemploTablassnake_case, pluralpartidas, jugadasColumnassnake_casefecha_inicio, resultado_final, fen_before, fen_afterClave primariaSiempre idid (UUID o BIGSERIAL)Claves foráneas<entidad_singular>_idpartida_idEstados / EnumsMayúsculas con guion bajoEN_PROGRESO, FINALIZADA, INTERRUMPIDARegla de integridad (RN-01 / SAD): El proceso de entrenamiento y consulta de la IA Propia debe filtrar estrictamente registros con WHERE partidas.estado = 'FINALIZADA'. Las partidas en estado EN_PROGRESO o INTERRUMPIDA persisten para auditoría y tolerancia a fallos, pero se excluyen del árbol de aprendizaje.2. Entorno Local — Puesta en MarchaRequisitos PreviosNode.js: v20.x LTS y npm: 10.xPostgreSQL: 15 o superior instalado localmenteMotor Stockfish: Binario oficial compatible con el sistema operativo anfitriónLibrerías Principales y Versiones de ReferenciaMódulo / LibreríaUbicaciónVersiónPropósitoNext.jsfrontend/14.xRenderizado, cliente visual interactivo e interfazExpressbackend/4.19.xAPI REST, orquestación de partidas y control de turnospg (node-postgres)backend/8.xDriver nativo de conexión y pool a PostgreSQLchess.jsbackend/ & frontend/1.x-betaMotor de reglas formales encapsulado tras Fachada TableroInstalación de StockfishEl backend ejecuta el motor como subproceso local (child_process.spawn) mediante pipes estándar (stdin/stdout) utilizando el protocolo UCI. No utiliza conexiones de red.Windows: Descargar el binario oficial desde stockfishchess.org y ubicarlo en backend/bin/stockfish.exe.macOS: brew install stockfish o colocar el binario compilado en backend/bin/stockfish.Linux: sudo apt-get install stockfish o descarga del binario nativo.La ruta absoluta o relativa al ejecutable debe configurarse mediante variables de entorno, sin hardcodear rutas en el código fuente.Variables de Entorno (.env.example)Crear un archivo .env dentro del directorio backend/ a partir del siguiente esquema:Bash# Configuración del Servidor Express
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Base de Datos PostgreSQL Local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ajedrez_db

# Motor Stockfish (Protocolo UCI)
STOCKFISH_PATH=/ruta/hacia/el/binario/stockfish
STOCKFISH_MOVETIME_MS=1000
STOCKFISH_TIMEOUT_MS=3000

# Servicio de IA Propia (Parametrización distribuida)
AI_SERVICE_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)
Inicialización de Base de Datos y SemillasBash# 1. Creación de la base relacional
createdb ajedrez_db

# 2. Ejecución del esquema DDL
psql -d ajedrez_db -f db/schema.sql

# 3. Carga atómica e idempotente del dataset inicial en PGN (RN-04)
npm run seed --prefix backend
3. Entorno Compartido para Pruebas de IntegraciónPara evitar discrepancias entre entornos locales y garantizar pruebas automatizadas aisladas, se define un servicio descartable con Docker Compose.Archivo docker-compose.ymlYAMLversion: "3.8"

services:
  postgres-test:
    image: postgres:15-alpine
    container_name: ajedrez_postgres_test
    environment:
      POSTGRES_DB: ajedrez_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"
    volumes:
      - pgdata_test:/var/lib/postgresql/data

volumes:
  pgdata_test:
Ejecución de Tests de IntegraciónBash# 1. Iniciar base de datos aislada
docker compose up -d postgres-test

# 2. Correr la suite de pruebas apuntando al puerto 5433
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/ajedrez_test npm run test:integration --prefix backend

# 3. Apagar contenedor al finalizar
docker compose down
Pipeline de Integración Continua (.github/workflows/ci.yml)YAMLname: CI Tests

on:
  pull_request:
    branches: [ develop, main ]

jobs:
  integration-and-unit-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: ajedrez_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout del repositorio
        uses: actions/checkout@v4

      - name: Configuración de Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Instalación de dependencias Backend
        run: npm ci --prefix backend

      - name: Ejecución de pruebas unitarias y de dominio
        run: npm run test --prefix backend

      - name: Ejecución de pruebas de integración
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/ajedrez_test
        run: npm run test:integration --prefix backend
4. Checklist de Onboarding para Nuevos IntegrantesClonar el repositorio y posicionarse en una rama de trabajo derivada de develop:Bashgit checkout -b feature/nombre-tarea develop
Instalar dependencias en ambas capas:Bashnpm install --prefix frontend && npm install --prefix backend
Configurar el archivo .env en backend/ tomando como referencia .env.example. Verificar que STOCKFISH_PATH apunte a un binario funcional.Levantar PostgreSQL local, crear la base ajedrez_db, aplicar db/schema.sql y ejecutar npm run seed --prefix backend.Comprobar que los tests pasen localmente ejecutando docker compose up -d postgres-test y corriendo npm run test:integration --prefix backend.
6. Para correr pruebas de integración, usá el Docker Compose de la sección 3 — no tu Postgres local.
