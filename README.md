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
| Saber cómo nombrar ramas y commits, y cómo abrir un PR | [`docs/documento-GC.md`](docs/documento-GC.md) §9 |

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
| Desarrollo Backend | Marcos Teixido, German Velazquez, Axel Nievas | Máximo Vinuesa
| Desarrollo Simulación (IA) | Paula Chicher, Lazaro Sanchez, Luciano Sigot |
| Calidad y Pruebas (QA) | Agustín Lucero, Franco Calizaya |
| Frontend, Análisis y Requisitos, Tech Lead | *(a completar)* |
