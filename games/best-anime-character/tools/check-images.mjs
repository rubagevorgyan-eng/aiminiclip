// Image audit for every character version: coverage by match level, missing, duplicate and (optionally) broken URLs.
//   node tools/check-images.mjs            offline checks
//   node tools/check-images.mjs --online   also HEAD-check every unique URL (cached in tools/cache/imgcheck.json)
// Exit 1 on errors: the same image on two different characters, or (with --online) a broken URL in the playable pool.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadABC } from './load.mjs';
import { CACHE } from './api.mjs';

const ABC = loadABC({ withCharacters: true }), ENG = ABC.engine;
const B = ENG.build(ABC.characters), all = B.entries, play = all.filter(ENG.playable);
const errors = [], pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + '%';

/* coverage */
const levels = ['key', 'single', 'latest', 'base', 'portrait', null];
const count = list => Object.fromEntries(levels.map(l => [l || 'none', list.filter(e => (e.imgMatch || null) === l).length]));
const cp = count(play), ca = count(all);
const formSpecific = cp.key + cp.single, probable = cp.latest + cp.base, withImg = play.filter(e => e.img).length;

/* duplicates: one URL on several characters = wrong artwork; on several versions of one character = not form-specific */
const byUrl = new Map();
for (const e of all) if (e.img) { if (!byUrl.has(e.img)) byUrl.set(e.img, []); byUrl.get(e.img).push(e); }
let crossChar = 0, sharedVersions = 0;
for (const [u, es] of byUrl) {
  const chars = new Set(es.map(e => e.charId));
  if (chars.size > 1) { crossChar++; errors.push('same image on different characters: ' + [...chars].join(', ') + ' — ' + u.slice(0, 90)); }
  else if (es.length > 1) sharedVersions += es.length;
}

/* broken (online) */
let broken = null;
if (process.argv.includes('--online')) {
  const file = join(CACHE, 'imgcheck.json'), cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const urls = [...new Set(play.map(e => e.img).filter(Boolean))].filter(u => !(u in cache));
  let i = 0;
  for (const u of urls) {
    let code = '000';
    try { code = execFileSync('curl', ['-s', '-o', '/dev/null', '-I', '-w', '%{http_code}', '--max-time', '20', '-A', 'RecessDevTool/1.0 (image check)', u], { encoding: 'utf8' }).trim(); } catch (e) {}
    cache[u] = code; if (++i % 100 === 0) { writeFileSync(file, JSON.stringify(cache)); process.stderr.write(`  checked ${i}/${urls.length}\n`); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120);   // polite pace
  }
  writeFileSync(file, JSON.stringify(cache));
  broken = play.filter(e => e.img && !/^2\d\d$/.test(cache[e.img] || '')).map(e => e.id + ' (' + cache[e.img] + ')');
  broken.forEach(b => errors.push('broken image: ' + b));
}

/* spoiler check: Anime-only-eligible versions must not use a manga-subtree image */
const mangaTab = play.filter(e => (e.anime === 'shown' || e.anime === 'anime-only') && /^manga\b/i.test(e.imgTab || ''));
mangaTab.forEach(e => errors.push('anime-eligible version uses a Manga gallery image: ' + e.id));

const R = {
  versions: all.length, playableVersions: play.length, playableCharacters: new Set(play.map(e => e.charId)).size,
  playable: { formSpecific, probable, portrait: cp.portrait, missing: cp.none, withImage: withImg },
  coverage: { anyImage: pct(withImg, play.length), formSpecificVerified: pct(formSpecific, play.length), formSpecificOrProbable: pct(formSpecific + probable, play.length) },
  allVersions: ca, duplicates: { acrossCharacters: crossChar, versionsSharingOneImage: sharedVersions }, brokenChecked: broken ? broken.length : 'not run (use --online)'
};
writeFileSync(join(CACHE, '..', 'image-report.json'), JSON.stringify(R, null, 1));
console.log(`Playable versions: ${play.length} (${R.playableCharacters} characters)`);
console.log(`  form-specific (tab named after the version, or single-image single-version profile): ${formSpecific}  ${R.coverage.formSpecificVerified}`);
console.log(`  probable (strongest/last gallery image for the latest version, first image for a "Base" version): ${probable}`);
console.log(`  original portrait (single-version character): ${cp.portrait}   missing (fallback art, flagged): ${cp.none}`);
console.log(`  any image: ${withImg}  ${R.coverage.anyImage}`);
console.log(`Duplicates: ${crossChar} images on different characters, ${sharedVersions} versions sharing an image with another version of the same character`);
console.log(`Broken: ${R.brokenChecked}  ·  anime-eligible versions with manga art: ${mangaTab.length}`);
if (errors.length) { console.log('\nERRORS (' + errors.length + ')\n' + errors.slice(0, 20).join('\n')); process.exit(1); }
