# Ajedrez UNViMe — Sistema de Ajedrez Local con Motores e IA Basada en Datos



Aplicación local de ajedrez con tres modos de juego: dos jugadores en el mismo dispositivo,

jugador contra Stockfish (protocolo UCI) y jugador contra una IA propia que decide a partir

de partidas históricas guardadas en PostgreSQL. Todo corre en la misma máquina (`127.0.0.1`).



## Dónde está cada cosa



| Necesito… | Voy a… |

|---|---|

| Levantar el proyecto en mi PC | [`docs/documento-GC.md`](docs/documento-GC.md) §6 |

| Valores exactos de variables, puertos, usuarios y bases | [`docs/documento-GC.md`](docs/documento-GC.md) §1–§5 |

| Correr las pruebas de integración | [`docs/documento-GC.md`](docs/documento-GC.md) §7 |

| Instalar la versión de entrega | [`docs/documento-GC.md`](docs/documento-GC.md) §8 |

| Conocer las reglas de ramas, commits y Pull Requests | [`docs/documento-GC.md`](docs/documento-GC.md) §9 |



---



## 🛑 Regla estricta de Git (Branch Protection)



Las ramas **`main`** y **`develop`** están protegidas en GitHub:

- **Prohibido el commit o push directo a `develop` y `main`**. Si intentas hacer `git push origin develop`, GitHub rechazará la subida con un error `GH013: Repository rule violations`.

- **Todo cambio debe ingresar mediante un Pull Request (PR)** hacia `develop`.

- Para que un PR pueda fusionarse, requiere:

  1. Que el chequeo automático de CI (`backend-tests`) termine en verde.

  2. La aprobación de al menos un Code Owner (`@Maxivinuesa23` o `@biangt`).



---



## 🚀 Cómo trabajar y subir cambios (Flujo de Git)



### 1. Actualizar `develop` en tu máquina

Antes de arrancar cualquier tarea, asegúrate de tener la última versión:

```bash

git checkout develop

git pull origin develop

```



### 2. Crear tu rama de trabajo

Las ramas siempre salen de `develop` y usan los prefijos normados:

* `feature/<nombre-corto>`: nueva funcionalidad (ej. `feature/uci-stockfish`).

* `fix/<nombre-corto>`: corrección de un bug (ej. `fix/timeout-stockfish`).

* `docs/<nombre-corto>`: cambios solo de documentación (ej. `docs/actualizar-gc`).



```bash

git checkout -b feature/nombre-de-tu-tarea develop

```



### 3. Hacer tus cambios y confirmar el commit

Usa commits semánticos con el formato `tipo(alcance): descripción en presente`:

* **Tipos:** `feat`, `fix`, `docs`, `test`, `refactor`.

* **Alcances:** `frontend`, `backend`, `ai`, `db`, `docs`, `ci`.



```bash

git add .

git commit -m "feat(backend): implementar validacion de jugadas"

```



### 4. Subir TU rama a GitHub

**Único comando de push permitido**: siempre hacia el nombre de tu rama secundaria.

```bash

git push -u origin feature/nombre-de-tu-tarea

```



### 5. Abrir el Pull Request en GitHub

1. Abre el enlace que te devuelve la terminal o entra al repositorio en GitHub.

2. Verifica que la **rama base de destino sea `develop`** (no `main`).

3. Completa la plantilla que aparece en la descripción.

4. Espera a que el CI (`backend-tests`) quede en verde y solicita la revisión de los Code Owners.

5. Una vez aprobado, se realiza **Squash and merge**.



### 6. Sincronizar y limpiar tu copia local

Una vez fusionado el PR en GitHub:

```bash

git checkout develop

git pull origin develop

git branch -d feature/nombre-de-tu-tarea

```



---



## 💡 Ejemplos prácticos de trabajo



### Ejemplo A: Desarrollar una funcionalidad de Backend

```bash

# 1. Pararse en develop y actualizar

git checkout develop

git pull origin develop



# 2. Crear la rama

git checkout -b feature/api-games develop



# 3. Trabajar en el código, luego comitear

git add backend/src/controllers/ backend/src/routes/

git commit -m "feat(backend): agregar endpoints para crear partida"



# 4. Subir la rama

git push -u origin feature/api-games



# 5. Ir a GitHub y abrir el PR apuntando a 'develop'

```



### Ejemplo B: Corregir un fallo (Fix)

```bash

git checkout develop

git pull origin develop

git checkout -b fix/timeout-stockfish develop



# Trabajar en la corrección

git add backend/src/engines/

git commit -m "fix(backend): corregir manejo de timeout defensivo en uci"



git push -u origin fix/timeout-stockfish

# Abrir PR hacia 'develop'

```



### Ejemplo C: Modificar la base de datos o documentación

```bash

git checkout develop

git pull origin develop

git checkout -b docs/actualizar-seeds develop



git add db/seeds/

git commit -m "docs(db): actualizar valores de dificultad en seed"



git push -u origin docs/actualizar-seeds

# Abrir PR hacia 'develop'

```



---



## Arranque rápido (DEV)



```bash

git checkout -b feature/mi-tarea develop

cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env && cp ai-service/.env.example ai-service/.env

# Crear rol y base, aplicar esquema y seeds → docs/documento-GC.md §4 y §6

```



| Servicio | URL local |

|---|---|

| Frontend | http://localhost:5173 |

| Backend (API) | http://127.0.0.1:3001 |

| Servicio de IA | http://127.0.0.1:8000 |

| PostgreSQL | 127.0.0.1:5432 |



## Estructura



```

frontend/         Interfaz (tablero, selector de modo)

backend/          API REST, reglas, motores, persistencia

ai-service/       Servicio Python de IA propia

db/               schema.sql, init.sql y seeds

docs/             Documentos de cada equipo

tests-integracion/  Pruebas de integración (QA)

```



## Equipos



| Equipo | Integrantes |

|---|---|

| Arquitectura | Thomas Cardarelli |

| Diseño Técnico | Nacho Gaynor, Gonzalo Rozandal |

| Modelado y Gestión de Datos | Mateo Vanden, Valentín Faba, Máximo Vinuesa |

| Diseño Gráfico & UX | Perla Quispe |

| Gestión de la Configuración | Facundo Olivera |

| Desarrollo Backend | Marcos Teixido, German Velazquez, Axel Nievas | Máximo Vinuesa |

| Desarrollo Simulación (IA) | Paula Chicher, Lazaro Sanchez, Luciano Sigot |

| Calidad y Pruebas (QA) | Agustín Lucero, Franco Calizaya |

| Frontend, Análisis y Requisitos, Tech Lead | *(a completar)* |