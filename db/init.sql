-- =============================================================================
-- db/init.sql — Aprovisionamiento de rol y base de datos (idempotente)
-- Ejecutar UNA vez por entorno, como superusuario de PostgreSQL ("postgres").
-- No es usado por la aplicación.
--
-- DEV:
--   psql -h 127.0.0.1 -U postgres -v app_role=ajedrez_dev -v app_password=ajedrez_dev -v app_db=ajedrez_db -f db/init.sql
-- PROD (contraseña generada con: openssl rand -hex 24):
--   psql -h 127.0.0.1 -U postgres -v app_role=ajedrez_app -v app_password=<SECRETO> -v app_db=ajedrez_prod -f db/init.sql
--
-- Detalle completo en docs/documento-GC.md §4.2.
-- =============================================================================

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') \gexec

-- Solo el dueño (y los superusuarios) pueden conectarse a la base.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
