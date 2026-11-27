// Load the browser data scripts (config, engine, characters) into Node's global scope.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
let loaded = false;
export function loadABC({ withCharacters = false } = {}) {
  if (!loaded) {
    for (const f of ['config.js', 'engine.js']) vm.runInThisContext(readFileSync(join(DATA, f), 'utf8'), { filename: f });
    loaded = true;
  }
  if (withCharacters && !globalThis.ABC.characters) {
    const dir = join(DATA, 'characters');
    for (const f of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) vm.runInThisContext(readFileSync(join(dir, f), 'utf8'), { filename: f });
  }
  return globalThis.ABC;
}
