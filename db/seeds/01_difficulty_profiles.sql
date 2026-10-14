-- =============================================================================
-- db/seeds/01_difficulty_profiles.sql — Perfiles de dificultad (idempotente)
-- Valores: SAD v1.2 §6.1 (Skill Level Fácil = 3, Medio = 10, Difícil = 20) y
-- STOCKFISH_MOVETIME_MS = 1000 (docs/documento-GC.md §3).
-- search_depth queda NULL: el motor usa "go movetime", no "go depth".
-- Los nombres van sin tilde y en mayúsculas para evitar problemas de codificación
-- del cliente psql en Windows.
-- BORRADOR: el modelo de 04 · Modelado no tiene columnas de rango ELO
-- (ver discrepancia D-09). Cuando Modelado las agregue, completar este seed.
-- Uso: psql -h 127.0.0.1 -U <usuario> -d <base> -f db/seeds/01_difficulty_profiles.sql
-- =============================================================================

INSERT INTO difficulty_profiles (name, skill_level, search_depth, time_limit_ms)
SELECT v.name, v.skill_level, v.search_depth, v.time_limit_ms
FROM (VALUES
    ('FACIL',   3,  NULL::int, 1000),
    ('MEDIO',   10, NULL::int, 1000),
    ('DIFICIL', 20, NULL::int, 1000)
) AS v(name, skill_level, search_depth, time_limit_ms)
WHERE NOT EXISTS (
    SELECT 1 FROM difficulty_profiles d WHERE d.name = v.name
);
