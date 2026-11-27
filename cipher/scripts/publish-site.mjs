// Copies the production build into the Recess site at ../games/cipher/, replacing what was there.
// Usage: npm run publish:site   (builds first)
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const target = join(root, '..', 'games', 'cipher');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}
if (existsSync(target)) for (const f of readdirSync(target)) rmSync(join(target, f), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
console.log(`Published ${dist} -> ${target}`);
