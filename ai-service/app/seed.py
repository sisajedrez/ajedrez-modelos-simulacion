
import logging
from typing import Dict, Optional

import chess
import chess.pgn
from psycopg2.extras import execute_values

from .db import get_conn
from .policies import DIFICIL, FACIL, LEVELS, MEDIO, level_from_elo, level_from_name

log = logging.getLogger("ai.seed")

RESULT_MAP = {"1-0": "1-0", "0-1": "0-1", "1/2-1/2": "Tablas"}
DEFAULT_SKILL = {FACIL: 3, MEDIO: 10, DIFICIL: 20}
DEFAULT_NAME = {FACIL: "Fácil", MEDIO: "Medio", DIFICIL: "Difícil"}


def parse_elo(value: Optional[str]) -> Optional[int]:
    try:
        elo = int(value)
    except (TypeError, ValueError):
        return None
    return elo if elo > 0 else None


def ensure_profiles(cur) -> Dict[str, str]:
    
    cur.execute("SELECT id, name FROM difficulty_profiles ORDER BY name")
    found: Dict[str, str] = {}
    for pid, name in cur.fetchall():
        level = level_from_name(name)
        if level and level not in found:
            found[level] = pid
    for level in LEVELS:
        if level not in found:
            cur.execute(
                (DEFAULT_NAME[level], DEFAULT_SKILL[level]),
            )
            found[level] = cur.fetchone()[0]
    return found


def seed_dataset(pgn_path: str, max_games: int = 5000, force: bool = False, database_url: str = None) -> dict:
    stats = {"games": 0, "moves": 0, "skipped_games": 0}
    with get_conn(database_url) as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM games WHERE source = 'SEED'")
                existing = cur.fetchone()[0]
                if existing and not force:
                    return {"status": "skipped", "reason": "dataset ya cargado", "existing_games": existing}
                if existing and force:
                    cur.execute("DELETE FROM games WHERE source = 'SEED'")  

                profiles = ensure_profiles(cur)

                with open(pgn_path, "r", encoding="utf-8", errors="replace") as fh:
                    while stats["games"] < max_games:
                        game = chess.pgn.read_game(fh)
                        if game is None:
                            break
                        row = _game_rows(game)
                        if row is None:
                            stats["skipped_games"] += 1
                            continue
                        header, moves, final_fen, avg_elo = row
                        level = level_from_elo(avg_elo)
                        cur.execute(
                            """INSERT INTO games
                               (white_player_name, black_player_name, mode, white_type, black_type,
                                difficulty_profile_id, status, result, ended_at, current_fen, source)
                               VALUES (%s, %s, 'LOCAL', 'HUMAN', 'HUMAN', %s, 'FINALIZADA', %s,
                                       CURRENT_TIMESTAMP, %s, 'SEED') RETURNING id""",
                            (header["white"], header["black"], profiles[level], header["result"], final_fen),
                        )
                        game_id = cur.fetchone()[0]
                        execute_values(
                            cur,
                            """INSERT INTO moves (game_id, move_number, color, san, fen_before, fen_after)
                               VALUES %s""",
                            [(game_id, *m) for m in moves],
                            template="(%s, %s, %s::piece_color, %s, %s, %s)",
                            page_size=1000,
                        )
                        stats["games"] += 1
                        stats["moves"] += len(moves)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    log.info("Seed completo: %s", stats)
    return {"status": "loaded", **stats}


def _game_rows(game: chess.pgn.Game):
    """Extrae (cabecera, jugadas, fen final, elo promedio) o None si la partida no sirve."""
    result = RESULT_MAP.get(game.headers.get("Result", "*"))
    white_elo = parse_elo(game.headers.get("WhiteElo"))
    black_elo = parse_elo(game.headers.get("BlackElo"))
    if result is None or white_elo is None or black_elo is None:
        return None

    board = game.board()
    moves = []
    for ply, move in enumerate(game.mainline_moves(), start=1):
        color = "WHITE" if board.turn == chess.WHITE else "BLACK"
        san = board.san(move)
        fen_before = board.fen()
        board.push(move)
        if len(san) > 10:
            return None
        moves.append((ply, color, san, fen_before, board.fen()))
    if not moves:
        return None

    header = {
        "white": (game.headers.get("White") or "?")[:100],
        "black": (game.headers.get("Black") or "?")[:100],
        "result": result,
    }
    return header, moves, board.fen(), (white_elo + black_elo) // 2
