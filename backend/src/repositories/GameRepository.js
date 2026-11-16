const toGame = (r) =>
  r && {
    id: r.id,
    whitePlayerName: r.white_player_name,
    blackPlayerName: r.black_player_name,
    mode: r.mode,
    whiteType: r.white_type,
    blackType: r.black_type,
    difficultyProfileId: r.difficulty_profile_id,
    status: r.status,
    result: r.result,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    currentFen: r.current_fen,
    source: r.source,
  };

// `db` is anything with query(text, params): the pool or a transaction client.
export class GameRepository {
  constructor(db) {
    this.db = db;
  }

  // status/result/source are optional (DB defaults: EN_PROGRESO / null / USER).
  // A game created as FINALIZADA gets ended_at = NOW().
  async create(game, executor = this.db) {
    const { rows } = await executor.query(
      `INSERT INTO games
         (white_player_name, black_player_name, mode, white_type, black_type,
          difficulty_profile_id, current_fen, status, result, source, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               COALESCE($8::game_status, 'EN_PROGRESO'), $9,
               COALESCE($10::game_source, 'USER'),
               CASE WHEN $8::game_status = 'FINALIZADA' THEN NOW() END)
       RETURNING *`,
      [
        game.whitePlayerName,
        game.blackPlayerName,
        game.mode,
        game.whiteType,
        game.blackType,
        game.difficultyProfileId ?? null,
        game.currentFen,
        game.status ?? null,
        game.result ?? null,
        game.source ?? null,
      ],
    );
    return toGame(rows[0]);
  }

  async updateStatus(id, status, executor = this.db) {
    const { rows } = await executor.query(
      'UPDATE games SET status = $2 WHERE id = $1 RETURNING *',
      [id, status],
    );
    return toGame(rows[0]) ?? null;
  }

  // Startup recovery in one statement; returns how many games were moved.
  async pausarEnProgreso(executor = this.db) {
    const res = await executor.query(
      `UPDATE games SET status = 'PENDIENTE' WHERE status = 'EN_PROGRESO'`,
    );
    return res.rowCount ?? 0;
  }

  async existsBySource(source, executor = this.db) {
    const { rows } = await executor.query('SELECT 1 FROM games WHERE source = $1 LIMIT 1', [source]);
    return rows.length > 0;
  }

  // History listing: one query for the page (LEFT JOINs + COUNT, no N+1) and one for the total.
  async list({ mode, difficulty, status, result, limit = 50, offset = 0 } = {}, executor = this.db) {
    const where = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (mode) add('g.mode = ?', mode);
    if (difficulty) add('dp.name = ?', difficulty);
    if (status) add('g.status = ?', status);
    if (result) add('g.result = ?', result);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = await executor.query(
      `SELECT COUNT(*) AS total FROM games g
       LEFT JOIN difficulty_profiles dp ON dp.id = g.difficulty_profile_id ${clause}`,
      params,
    );
    const page = await executor.query(
      `SELECT g.id, g.started_at, g.ended_at, g.white_player_name, g.black_player_name,
              g.mode, g.status, g.result, g.source, dp.name AS difficulty,
              COUNT(m.id) AS move_count
       FROM games g
       LEFT JOIN difficulty_profiles dp ON dp.id = g.difficulty_profile_id
       LEFT JOIN moves m ON m.game_id = g.id
       ${clause}
       GROUP BY g.id, dp.name
       ORDER BY g.started_at DESC, g.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      total: Number(total.rows[0].total),
      items: page.rows.map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        whitePlayerName: r.white_player_name,
        blackPlayerName: r.black_player_name,
        mode: r.mode,
        difficulty: r.difficulty ?? null,
        moveCount: Number(r.move_count),
        status: r.status,
        result: r.result,
        source: r.source,
      })),
    };
  }

  async findById(id, executor = this.db) {
    const { rows } = await executor.query('SELECT * FROM games WHERE id = $1', [id]);
    return toGame(rows[0]) ?? null;
  }

  async updateFen(id, fen, executor = this.db) {
    const { rows } = await executor.query(
      'UPDATE games SET current_fen = $2 WHERE id = $1 RETURNING *',
      [id, fen],
    );
    return toGame(rows[0]) ?? null;
  }

  async finish(id, { result }, executor = this.db) {
    const { rows } = await executor.query(
      `UPDATE games SET status = 'FINALIZADA', result = $2, ended_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, result],
    );
    return toGame(rows[0]) ?? null;
  }
}
