import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { splitPgnGames } from '../src/services/PgnService.js';

// Core seed logic. `texts` are the contents of PGN files (each may hold several games).
// Idempotent: if any SEED game already exists nothing is inserted.
// Inserts every finished game in ONE transaction (all-or-nothing); undecided games are skipped.
export async function seedFromPgn(texts, { gameRepo, pgnService, log = console.log }) {
  if (await gameRepo.existsBySource('SEED')) {
    log('Seed games already exist; nothing to do.');
    return { alreadySeeded: true, imported: 0, skipped: 0 };
  }
  const games = texts.flatMap((t) => splitPgnGames(t));
  const { imported, skipped } = await pgnService.importarLote(games, { source: 'SEED' });
  log(`Seed complete: ${imported} game(s) imported, ${skipped} skipped (no decisive/draw result).`);
  return { alreadySeeded: false, imported, skipped };
}

async function main(paths) {
  if (paths.length === 0) {
    console.error('Usage: pnpm seed <file.pgn> [more.pgn ...]');
    return 1;
  }
  const texts = await Promise.all(paths.map((p) => readFile(p, 'utf8')));

  // Loaded lazily so importing seedFromPgn (tests) never opens a database pool.
  const { pool, closePool, withTransaction } = await import('../src/repositories/db.js');
  const { GameRepository } = await import('../src/repositories/GameRepository.js');
  const { MoveRepository } = await import('../src/repositories/MoveRepository.js');
  const { PgnService } = await import('../src/services/PgnService.js');
  const gameRepo = new GameRepository(pool);
  const pgnService = new PgnService({ gameRepo, moveRepo: new MoveRepository(pool), withTransaction });
  try {
    await seedFromPgn(texts, { gameRepo, pgnService });
    return 0;
  } catch (err) {
    console.error(`Seed failed, nothing was inserted: ${err.message}`);
    return 1;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
