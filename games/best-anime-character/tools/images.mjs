// Form-specific artwork from VS Battles profile galleries (the image tabber at the top of each profile).
// Nothing is guessed: file names come from the cached profile wikitext, URLs from the MediaWiki imageinfo API.
//
// Match levels (stored as entry.imgMatch):
//   key     a gallery tab is named like the version's profile key (e.g. tab "Past" for key "Past")
//   single  the profile has one key and one gallery image, so the image is that version
//   latest  latest-key version + no named tab: the gallery's LAST image (galleries run base -> strongest) — probable
//   base    "Base" key + no named tab: the gallery's FIRST image — probable
//   portrait the original roster's AniList portrait, kept only for characters with a single version
// Anything else gets no image and is flagged in the report (fallback art), never a different form's picture.
// Anime vs Manga gallery splits: anime-shown versions take the Anime subtree, manga-only versions the Manga subtree.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { api, CACHE } from './api.mjs';

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/▾/g, '').replace(/[^a-z0-9]+/g, '');

/* Walk the intro tabber: returns [{path:[labels], file}] in document order (first file per tab). */
export function gallery(wikitext) {
  let end = wikitext.length;
  for (const m of ['\n==Summary==', '\n== Summary ==', "'''[[Tiering System"]) { const i = wikitext.indexOf(m); if (i > 0 && i < end) end = i; }
  const text = wikitext.slice(0, end);
  const out = [], path = [], seen = new Set();
  let level = 0;
  const re = /\|-\|([^=\n]+)=|\{\{!\}\}-\{\{!\}\}([^=\n]+)=|\{\{#tag:tabber\|?|\n\}\}|\[\[(?:File|Image):([^|\]]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] != null) { level = 0; path.length = 0; path[0] = m[1].trim(); }
    else if (m[2] != null) { path.length = level + 1; path[level] = m[2].trim(); }
    else if (m[0].startsWith('{{#tag:tabber')) { level++; }
    else if (m[0] === '\n}}') { if (level > 0) { level--; path.length = level + 1; } }
    else if (m[3] != null) {
      const key = path.slice(0, level + 1).join(' / ');
      if (seen.has(key)) continue; seen.add(key);
      out.push({ path: path.slice(0, level + 1).filter(Boolean), file: m[3].trim().replace(/_/g, ' ') });
    }
  }
  return out;
}

/* Pick the image for one version. anime: entry anime status; keyIndex/keys from the import. */
export function pickImage(wikitext, { key, keys, keyIndex, anime }) {
  let g = gallery(wikitext);
  if (!g.length) return null;
  const tops = new Set(g.map(x => norm(x.path[0])));
  if (tops.has('anime') && tops.has('manga')) {                     // spoiler-aware subtree
    const want = anime === 'not-shown' ? 'manga' : 'anime';
    const sub = g.filter(x => norm(x.path[0]) === want);
    if (sub.length) g = sub.map(x => ({ path: x.path.slice(1), file: x.file }));
  }
  /* exact label match (ignoring "arc/saga/form/mode" suffixes); if the matching tab holds several images, take
     its last one — the strongest look shown for that version */
  const bare = s => norm(String(s).replace(/\b(arc|saga|form|mode)\b/gi, ''));
  const k = bare(key);
  if (k) {
    let hit = null;
    for (let d = 0; d < 4 && !hit; d++) {
      const sub = g.filter(x => x.path[d] != null && bare(x.path[d]) === k);
      if (sub.length) hit = { x: sub[sub.length - 1], label: sub[0].path.slice(0, d + 1).join(' / ') };
    }
    if (hit) return { file: hit.x.file, match: 'key', tab: hit.x.path.join(' / ') };
  }
  const nKeys = (keys || ['']).filter(Boolean).length;
  if (nKeys <= 1 && g.length === 1) return { file: g[0].file, match: 'single', tab: g[0].path.join(' / ') };
  if (nKeys <= 1 && g.length > 1) return { file: g[g.length - 1].file, match: 'latest', tab: g[g.length - 1].path.join(' / ') };
  if (/^base$/i.test(key || '')) return { file: g[0].file, match: 'base', tab: g[0].path.join(' / ') };
  if (keyIndex === (keys || []).length - 1) return { file: g[g.length - 1].file, match: 'latest', tab: g[g.length - 1].path.join(' / ') };
  return null;
}

/* Resolve file names -> {url, thumb, page} through imageinfo (50 per request), cached in tools/cache/imageinfo.json */
export function resolveFiles(files, { width = 400 } = {}) {
  const file = join(CACHE, 'imageinfo.json');
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const need = [...new Set(files)].filter(f => !(f in cache));
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const d = api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(width), titles: batch.map(f => 'File:' + f).join('|') });
    const norm2 = new Map((d.query.normalized || []).map(n => [n.to, n.from]));
    for (const p of d.query.pages) {
      const from = (norm2.get(p.title) || p.title).replace(/^File:/, '');
      const ii = p.imageinfo && p.imageinfo[0];
      cache[from] = ii && !p.missing ? { url: ii.url, thumb: ii.thumburl || ii.url, page: ii.descriptionurl, w: ii.width, h: ii.height, mime: ii.mime } : null;
    }
    for (const f of batch) if (!(f in cache)) cache[f] = null;
    writeFileSync(file, JSON.stringify(cache));
    process.stderr.write(`  imageinfo ${Math.min(i + 50, need.length)}/${need.length}\n`);
  }
  return cache;
}
