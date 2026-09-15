# Documento de Gestión de la Configuración (GC)
**Proyecto:** Ajedrez + Stockfish — Modelos y Simulación

> Nota: el stack (Next.js + Express + PostgreSQL) ya está confirmado por el
> Documento de Arquitectura v1.1 de Thomas Cardarelli. Las versiones puntuales
> de Node y PostgreSQL siguen siendo referencia de GC hasta que Arquitectura
> las fije.

---

## 1. Control de versiones y repositorio

Usamos **Git** como sistema de control de versiones, alojado en **GitHub**.

**Repositorio del proyecto:**
`https://github.com/sisajedrez/ajedrez-modelos-simulacion.git`

- `main`: rama principal, siempre con código estable — es lo que se entrega al profesor.
- Todo el trabajo en curso pasa primero por `develop` y por ramas `feature/*` o `fix/*` antes de llegar a `main` (convención completa más abajo).

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

### Convención de ramas
| Rama | Uso |
|---|---|
| `main` | Código estable, lo que se entrega al profesor |
| `develop` | Integración de features antes de pasar a `main` |
| `feature/<nombre-corto>` | Una funcionalidad nueva, ej. `feature/motor-stockfish`, `feature/validador-jugada`, `feature/tablero-frontend` |
| `fix/<nombre-corto>` | Corrección de un bug puntual |

**Reglas:**
- Nadie hace commit directo a `main` ni a `develop`.
- Todo cambio entra por Pull Request, revisado y aprobado por el Tech Lead.
- Una rama = una responsabilidad (no mezclar frontend y motor de Stockfish en la misma rama).

### Convención de commits
Prefijo + descripción corta en presente:
```
feat: implementa MotorStockfish con protocolo UCI
fix: corrige detección de jaque mate por ahogado
docs: agrega guía de entorno local
test: agrega pruebas unitarias para ValidadorDeJugada
```

### Convención de nombres para la base de datos
Sobre las entidades definidas por Modelado de Datos (`Partida`, `Jugada`,
`Jugador/Perfil`, `ConfiguracionDeDificultad`):

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas | snake_case, plural | `partidas`, `jugadas`, `jugadores`, `configuraciones_dificultad` |
| Columnas | snake_case | `fecha_inicio`, `resultado_final`, `nivel_dificultad` |
| Clave primaria | siempre `id` | `id` |
| Clave foránea | `<entidad_singular>_id` | `partida_id`, `jugador_id` |
| Estados fijos / enums | MAYÚSCULAS con guión bajo | `EN_PROGRESO`, `FINALIZADA`, `INTERRUMPIDA` (ver RN-01 y Documento de Arquitectura v1.1 — la IA propia solo entrena con partidas `FINALIZADA`) |

Modelado de Datos es quien diseña el modelo físico final; esta tabla fija
solo el *estilo* de nombres para que todas las tablas y columnas sean
consistentes entre sí.

---

## 2. Entorno local — cómo levantarlo

### Requisitos previos
- **Node.js** (LTS, ej. v20.x) y npm 10.x
- **PostgreSQL** 15 o superior
- **Binario de Stockfish** (motor elegido por Arquitectura)

### Librerías principales y versiones
| Librería | Dónde se usa | Versión de referencia |
|---|---|---|
| Next.js | `frontend/` | 14.x |
| Express | `backend/` | 4.19.x |
| `pg` (node-postgres) | `backend/`, acceso a PostgreSQL | 8.x |
| `chess.js` | `backend/`, aislada detrás de la Fachada `Tablero` (ver Documento de Arquitectura v1.1) | 1.x |

Estas son versiones de referencia fijadas por GC para evitar que cada dev
instale una distinta. Si Arquitectura o Diseño Técnico necesitan otra
versión puntual, se actualiza esta tabla y se avisa al equipo — no se cambia
en silencio en un solo `package.json`.

### Instalar Stockfish
| SO | Cómo |
|---|---|
| Windows | Descargar el ejecutable desde stockfishchess.org y guardarlo en una carpeta fija del proyecto, ej. `backend/bin/stockfish.exe` |
| macOS | `brew install stockfish` |
| Linux | `sudo apt install stockfish` (o descargar el binario oficial) |

La ruta al binario se configura por variable de entorno, nunca hardcodeada:
```
STOCKFISH_PATH=/ruta/a/stockfish
```

### PostgreSQL local
```bash
# crear la base
createdb ajedrez_db

# cargar el esquema (una vez que Modelado de Datos entregue schema.sql)
psql -d ajedrez_db -f db/schema.sql
```

### Variables de entorno (`.env.example`)
```
DATABASE_URL=postgresql://usuario:password@localhost:5432/ajedrez_db
STOCKFISH_PATH=/ruta/a/stockfish
PORT=4000
```
Cada dev copia este archivo a `.env` y completa sus valores locales. `.env` va en `.gitignore`, `.env.example` sí se versiona.

### Levantar el proyecto
```bash
# backend
cd backend
npm install
npm run dev

# frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

---

## 3. Entorno compartido para pruebas de integración

**Problema que resuelve:** que las pruebas de integración no dependan de la PC de un solo desarrollador (versión de Postgres, si tiene o no Stockfish instalado, etc.).

### Opción recomendada: Docker Compose
`docker-compose.yml` en la raíz, con un Postgres de pruebas aislado:

```yaml
version: "3.8"
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_DB: ajedrez_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

Correr las pruebas de integración contra este contenedor:
```bash
docker compose up -d postgres-test
DATABASE_URL=postgresql://test:test@localhost:5433/ajedrez_test npm run test:integration
docker compose down
```

### Opcional: CI automático (GitHub Actions)
Si el equipo sube el repo a GitHub, un workflow simple corre las pruebas en cada Pull Request, sin depender de ninguna PC:

```yaml
# .github/workflows/tests.yml
name: tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: ajedrez_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci --prefix backend
      - run: npm run test --prefix backend
```

---

## Checklist para un integrante nuevo (o si cambia quien ocupa un rol)
1. Cloná el repo y creá tu `.env` a partir de `.env.example`.
2. Instalá Node, PostgreSQL y Stockfish según la sección 2.
3. Corré `npm install` en `frontend/` y `backend/`.
4. Levantá la base local y cargá `db/schema.sql`.
5. Antes de programar, creá tu rama desde `develop` con la convención de nombres de la sección 1.
6. Para correr pruebas de integración, usá el Docker Compose de la sección 3 — no tu Postgres local.
