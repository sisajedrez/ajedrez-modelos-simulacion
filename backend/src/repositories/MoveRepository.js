const toMove = (r) => ({
  id: r.id,
  gameId: r.game_id,
  moveNumber: r.move_number,
  color: r.color,
  san: r.san,
  fenBefore: r.fen_before,
  fenAfter: r.fen_after,
  evalScore: r.eval_score,
  timeSpentMs: r.time_spent_ms,
  createdAt: r.created_at,
});

export class MoveRepository {
  constructor(db) {
    this.db = db;
  }

  async create(move, executor = this.db) {
    const { rows } = await executor.query(
      `INSERT INTO moves
         (game_id, move_number, color, san, fen_before, fen_after, eval_score, time_spent_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        move.gameId,
        move.moveNumber,
        move.color,
        move.san,
        move.fenBefore,
        move.fenAfter,
        move.evalScore ?? null,
        move.timeSpentMs ?? null,
      ],
    );
    return toMove(rows[0]);
  }

  // created_at ties inside one transaction are impossible to order on alone, so
  // fall back to move_number then color (WHITE moves first in a full move).
  async findByGameId(gameId, executor = this.db) {
    const { rows } = await executor.query(
      `SELECT * FROM moves WHERE game_id = $1
       ORDER BY created_at, move_number, (color = 'BLACK')`,
      [gameId],
    );
    return rows.map(toMove);
  }

  // D-08: training data for the AI. Only moves of FINALIZADA games may ever reach the AI service.
  async findTrainingMoves(executor = this.db) {
    const { rows } = await executor.query(
      `SELECT m.fen_before, m.san, g.result
       FROM moves m
       JOIN games g ON g.id = m.game_id
       WHERE g.status = 'FINALIZADA'`,
    );
    return rows.map((r) => ({ fenBefore: r.fen_before, san: r.san, result: r.result }));
  }
}
