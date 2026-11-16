import { parseEnv } from './parseEnv.js';

export { parseEnv };

function load() {
  try {
    return parseEnv(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// Importing this module validates process.env and exits on failure.
export const config = load();
