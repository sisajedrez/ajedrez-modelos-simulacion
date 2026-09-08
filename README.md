# Ajedrez + Modelos y Simulación

Aplicación local de ajedrez con tres modalidades de juego: vs. Jugador (mismo
dispositivo), vs. motor de ajedrez externo, y vs. IA propia entrenada a
partir del historial de partidas guardado. Proyecto de la materia Modelos y
Simulación.

## Stack
Next.js (frontend) + Express (backend) + PostgreSQL, todo corriendo
localmente sin exponer puertos a internet.

## Estructura del repositorio
```
frontend/       Interfaz de usuario (Next.js)
backend/        API, lógica de juego y motores (Express)
db/             Modelo físico de datos y seeds
docs/           Documentos de cada rol (arquitectura, diseño, GC, QA, análisis)
tests-integracion/   Pruebas de integración de QA
```

## Cómo levantar el entorno local
Ver la guía completa en [`docs/documento-GC.md`](docs/documento-GC.md):
requisitos, instalación del motor de ajedrez, PostgreSQL local, variables de
entorno y entorno compartido de pruebas.

## Convenciones del equipo
Ramas, nombres de commits y flujo de Pull Requests: también en
[`docs/documento-GC.md`](docs/documento-GC.md).

## Roles del equipo
Ver `Manual_de_Roles.pdf` (o su versión en `docs/`, si se sube).
