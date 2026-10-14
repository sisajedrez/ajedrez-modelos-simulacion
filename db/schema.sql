-- =============================================================================
-- db/schema.sql — Modelo físico (PostgreSQL 15+)
-- Fuente: Documento 04 · Modelado y Gestión de Datos (Mateo Vanden,
--         Valentín Faba, Máximo Vinuesa). Copiado sin cambios de modelo.
-- Fuente única del esquema (ver docs/documento-GC.md §4 y discrepancia D-11).
-- Uso: psql -h 127.0.0.1 -U <usuario> -d <base> -f db/schema.sql
-- Requiere PostgreSQL >= 13 por gen_random_uuid() (el proyecto fija >= 15).
-- =============================================================================

-- 1. Creación de tipos ENUM para asegurar consistencia de datos
CREATE TYPE game_mode AS ENUM ('LOCAL', 'STOCKFISH', 'AI');
CREATE TYPE player_type AS ENUM ('HUMAN', 'ENGINE', 'AI');
CREATE TYPE game_status AS ENUM ('EN_PROGRESO', 'PENDIENTE', 'FINALIZADA');
CREATE TYPE game_source AS ENUM ('USER', 'SEED');
CREATE TYPE piece_color AS ENUM ('WHITE', 'BLACK');

-- 2. Creación de Tabla: Perfiles de Dificultad
CREATE TABLE difficulty_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    skill_level INT,
    search_depth INT,
    time_limit_ms INT
);

-- 3. Creación de Tabla: Partidas
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    white_player_name VARCHAR(100) NOT NULL,
    black_player_name VARCHAR(100) NOT NULL,
    mode game_mode NOT NULL,
    white_type player_type NOT NULL,
    black_type player_type NOT NULL,
    difficulty_profile_id UUID REFERENCES difficulty_profiles(id),
    status game_status DEFAULT 'EN_PROGRESO',
    result VARCHAR(20),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    current_fen TEXT NOT NULL,
    source game_source DEFAULT 'USER'
);

-- 4. Creación de Tabla: Jugadas (Moves)
CREATE TABLE moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_number INT NOT NULL,
    color piece_color NOT NULL,
    san VARCHAR(10) NOT NULL,
    fen_before TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    eval_score FLOAT,
    time_spent_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Creación de Tabla: Versiones del Modelo de IA
CREATE TABLE ai_model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dataset_size INT NOT NULL,
    metrics JSONB,
    file_path TEXT NOT NULL
);

-- 6. Índices para optimizar las consultas de la IA
CREATE INDEX idx_moves_fen_before ON moves(fen_before);
CREATE INDEX idx_games_status ON games(status);
