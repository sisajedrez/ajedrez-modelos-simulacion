const toProfile = (r) =>
  r && {
    id: r.id,
    name: r.name,
    skillLevel: r.skill_level,
    searchDepth: r.search_depth,
    timeLimitMs: r.time_limit_ms,
  };

export class DifficultyProfileRepository {
  constructor(db) {
    this.db = db;
  }

  async findAll() {
    const { rows } = await this.db.query('SELECT * FROM difficulty_profiles ORDER BY skill_level');
    return rows.map(toProfile);
  }

  async findById(id) {
    const { rows } = await this.db.query('SELECT * FROM difficulty_profiles WHERE id = $1', [id]);
    return toProfile(rows[0]) ?? null;
  }

  async findByName(name) {
    const { rows } = await this.db.query('SELECT * FROM difficulty_profiles WHERE name = $1', [name]);
    return toProfile(rows[0]) ?? null;
  }
}
