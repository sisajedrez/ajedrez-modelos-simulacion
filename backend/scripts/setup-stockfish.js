import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const BIN_DIR = path.resolve(import.meta.dirname, '..', 'bin');
const LINUX_SF_URL =
  'https://github.com/official-stockfish/Stockfish/releases/download/sf_17/stockfish-ubuntu-x86-64.tar';

function extractFromTar(tarPath, entrySubstr, destPath) {
  const fd = fs.openSync(tarPath, 'r');
  const headerBuf = Buffer.alloc(512);
  let offset = 0;
  let found = false;

  try {
    while (fs.readSync(fd, headerBuf, 0, 512, offset) === 512) {
      offset += 512;
      const name = headerBuf.toString('utf8', 0, 100).replace(/\0.*$/, '');
      if (!name) break;
      const sizeOctal = headerBuf.toString('utf8', 124, 136).trim().replace(/\0.*$/, '');
      const size = parseInt(sizeOctal, 8);
      if (name.includes(entrySubstr)) {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const outFd = fs.openSync(destPath, 'w');
        const chunkBuf = Buffer.alloc(64 * 1024);
        let bytesRemaining = size;
        let currentOffset = offset;

        while (bytesRemaining > 0) {
          const toRead = Math.min(bytesRemaining, chunkBuf.length);
          fs.readSync(fd, chunkBuf, 0, toRead, currentOffset);
          fs.writeSync(outFd, chunkBuf, 0, toRead);
          currentOffset += toRead;
          bytesRemaining -= toRead;
        }

        fs.closeSync(outFd);
        found = true;
        break;
      }
      const blocks = Math.ceil(size / 512);
      offset += blocks * 512;
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!found) {
    throw new Error(`Entry matching '${entrySubstr}' not found in ${tarPath}`);
  }
}

async function downloadFile(url, destPath) {
  console.log(`Downloading Stockfish from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
  }
  const fileStream = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), fileStream);
}

export async function setupStockfish() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const targetBinName = isWin ? 'stockfish.exe' : 'stockfish';
  const targetBinPath = path.join(BIN_DIR, targetBinName);

  if (fs.existsSync(targetBinPath)) {
    const stat = fs.statSync(targetBinPath);
    if (stat.size > 0) {
      console.log(`Stockfish binary already present at ${targetBinPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
  }

  if (process.platform === 'linux') {
    const tempTar = path.join(os.tmpdir(), `stockfish-${Date.now()}.tar`);
    try {
      await downloadFile(LINUX_SF_URL, tempTar);
      console.log('Extracting Linux Stockfish binary...');
      extractFromTar(tempTar, 'stockfish-ubuntu-x86-64', targetBinPath);
      fs.chmodSync(targetBinPath, 0o755);
      console.log(`Successfully installed Stockfish at ${targetBinPath}`);
    } finally {
      if (fs.existsSync(tempTar)) {
        try { fs.unlinkSync(tempTar); } catch {}
      }
    }
  } else if (isWin) {
    console.warn(`Windows Stockfish binary not found at ${targetBinPath}. Please ensure stockfish.exe is provided.`);
  } else {
    console.warn(`Unsupported platform for auto-download: ${process.platform}. Please install Stockfish manually.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  setupStockfish().catch((err) => {
    console.error('Stockfish setup failed:', err.message);
    if (process.env.RENDER || process.env.CI) {
      process.exit(1);
    }
  });
}
