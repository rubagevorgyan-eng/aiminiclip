// Rate-limited, cached access to the VS Battles MediaWiki API (api.php — the supported read interface).
// One request at a time, >= 1.5 s apart, descriptive User-Agent. Responses are cached in tools/cache/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CACHE = join(dirname(fileURLToPath(import.meta.url)), 'cache');
const UA = 'RecessDevTool/1.0 (offline character data import; low volume)';
let last = 0, calls = 0;
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const slug = t => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const apiCalls = () => calls;

export function api(params) {
  const wait = 1500 - (Date.now() - last); if (wait > 0) sleep(wait);
  const url = 'https://vsbattles.fandom.com/api.php?' + new URLSearchParams({ ...params, format: 'json', formatversion: '2' });
  let body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { body = execFileSync('curl', ['-s', '--fail', '--max-time', '60', '-A', UA, url], { encoding: 'utf8', maxBuffer: 256 << 20 }); break; }
    catch (e) { if (attempt === 2) throw e; sleep(5000); }
  }
  last = Date.now(); calls++;
  return JSON.parse(body);
}

/* All page titles in a category (namespace 0), cached per category. */
export function categoryMembers(cat, { refresh = false } = {}) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, 'cat-' + slug(cat) + '.json');
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const out = []; let cont = {};
  do {
    const d = api({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + cat, cmlimit: '500', cmnamespace: '0', ...cont });
    out.push(...d.query.categorymembers.map(m => m.title));
    cont = d.continue || null;
  } while (cont);
  writeFileSync(file, JSON.stringify(out));
  return out;
}

/* Fetch many pages (50 per request) with content, revision id and categories; cache each page like tools/vsb.mjs. */
export function fetchPages(titles, { refresh = false } = {}) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const file = t => join(CACHE, slug(t) + '.json');
  const need = titles.filter(t => refresh || !existsSync(file(t)));
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const d = api({ action: 'query', prop: 'revisions|categories', rvprop: 'content|ids|timestamp', rvslots: 'main', cllimit: 'max', titles: batch.join('|') });
    const norm = new Map((d.query.normalized || []).map(n => [n.to, n.from]));
    for (const p of d.query.pages) {
      if (p.missing || !p.revisions) continue;
      const r = p.revisions[0];
      const rec = { title: p.title, revid: r.revid, timestamp: r.timestamp, fetched: new Date().toISOString().slice(0, 10),
        categories: (p.categories || []).map(c => c.title.replace(/^Category:/, '')), wikitext: r.slots.main.content };
      writeFileSync(file(p.title), JSON.stringify(rec));
      if (norm.has(p.title)) writeFileSync(file(norm.get(p.title)), JSON.stringify(rec));
    }
    process.stderr.write(`  fetched ${Math.min(i + 50, need.length)}/${need.length}\n`);
  }
  return titles.map(t => existsSync(file(t)) ? JSON.parse(readFileSync(file(t), 'utf8')) : null);
}
