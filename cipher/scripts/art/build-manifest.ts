/**
 * Scans public/portraits/ and writes src/art/portraits.manifest.json: which slots have final artwork.
 * Validates naming (`<family>-NN.webp|avif`), slot range, duplicates and size. Run: npm run art
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTRAIT_FAMILIES } from '../../src/art/families.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'public', 'portraits');
const MAX_BYTES = 120 * 1024;
const problems: string[] = [];
const families: Record<string, { target: number; slots: Record<string, string> }> = {};

for (const [family, { target }] of Object.entries(PORTRAIT_FAMILIES)) {
  const slots: Record<string, string> = {};
  const dir = join(DIR, family);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'README.md') : [];
  for (const f of files) {
    const m = f.match(new RegExp(`^${family}-(\\d{2})\\.(webp|avif)$`));
    if (!m) { problems.push(`${family}/${f}: name must be ${family}-NN.webp or .avif`); continue; }
    const slot = Number(m[1]);
    if (slot < 1 || slot > target) { problems.push(`${family}/${f}: slot outside 01–${String(target).padStart(2, '0')}`); continue; }
    if (statSync(join(dir, f)).size > MAX_BYTES) problems.push(`${family}/${f}: larger than ${MAX_BYTES / 1024} KB; optimize it`);
    const key = String(slot);
    if (slots[key]) { problems.push(`${family}: slot ${slot} supplied twice (${slots[key]}, ${f})`); continue; }
    slots[key] = `portraits/${family}/${f}`;
  }
  families[family] = { target, slots };
}

const supplied = Object.values(families).reduce((n, f) => n + Object.keys(f.slots).length, 0);
const target = Object.values(families).reduce((n, f) => n + f.target, 0);
writeFileSync(join(ROOT, 'src', 'art', 'portraits.manifest.json'), JSON.stringify({ target, supplied, families }, null, 2) + '\n');
console.log(`Portraits: ${supplied}/${target} final artworks supplied; ${target - supplied} slots use placeholders.`);
if (problems.length) {
  console.error(problems.map((p) => `  ✖ ${p}`).join('\n'));
  process.exit(1);
}
