// Fake UCI engine for tests. Behaviour via env:
//   FAKE_SF_MODE  normal | hang | hang_once | none | crash
//   FAKE_SF_MOVE  force the bestmove answer (e.g. "e7e8q")
//   FAKE_SF_LOG   file that receives every received command (one per line)
//   FAKE_SF_STATE marker file used by hang_once (first process hangs, later ones behave)
import readline from 'node:readline';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

let mode = process.env.FAKE_SF_MODE ?? 'normal';
if (mode === 'hang_once') {
  const marker = process.env.FAKE_SF_STATE;
  if (marker && existsSync(marker)) {
    mode = 'normal';
  } else {
    if (marker) writeFileSync(marker, '1');
    mode = 'hang';
  }
}

const log = process.env.FAKE_SF_LOG;
let fen = null;
const out = (line) => process.stdout.write(`${line}\n`);

const rl = readline.createInterface({ input: process.stdin });
rl.on('close', () => process.exit(0));
rl.on('line', (raw) => {
  const line = raw.trim();
  if (log) appendFileSync(log, `${line}\n`);
  if (line === 'uci') {
    out('id name FakeFish');
    out('uciok');
  } else if (line === 'isready') {
    out('readyok');
  } else if (line.startsWith('position fen ')) {
    fen = line.slice('position fen '.length);
  } else if (line.startsWith('go')) {
    if (mode === 'hang') return;
    if (mode === 'crash') process.exit(3);
    if (mode === 'none') return out('bestmove (none)');
    if (process.env.FAKE_SF_MOVE) return out(`bestmove ${process.env.FAKE_SF_MOVE}`);
    const m = new Chess(fen).moves({ verbose: true })[0];
    out(`bestmove ${m.from}${m.to}${m.promotion ?? ''}`);
  } else if (line === 'quit') {
    process.exit(0);
  }
});
