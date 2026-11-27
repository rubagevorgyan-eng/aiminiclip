// Character database pipeline: VS Battles series import + reviewer spec + legacy roster -> data/characters/<series>.js
//
//   node tools/build-data.mjs                     rebuild from cached imports (imports missing series)
//   node tools/build-data.mjs --series op,db      (re)import these series, then rebuild
//   node tools/build-data.mjs --series all        (re)import every series
//   add --refresh to re-download pages (otherwise cached revisions are reused)
//
// Per series batch: discover (category members) -> fetch (cached, 50/request) -> keep canonical character pages ->
// normalise names -> group versions by canonical character -> extract version stats -> score -> status -> save
// tools/imports/<series>.json. Unchanged revisions are never re-extracted. Then everything is merged and validated.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryMembers, fetchPages, slug, apiCalls } from './api.mjs';
import { extract, keysOf, fieldText } from './vsb.mjs';
import { loadABC } from './load.mjs';
import VERIFIED from './spec/verified.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const IMPORTS = join(HERE, 'imports'), OUT = join(ROOT, 'data', 'characters');
const ABC = loadABC(), CFG = ABC.config, ENG = ABC.engine;
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const refresh = process.argv.includes('--refresh');
const SIDS = Object.keys(CFG.series);
const want = (arg('--series') || '').split(',').filter(Boolean);
const toImport = want.includes('all') ? SIDS : want;
const today = new Date().toISOString().slice(0, 10);
for (const d of [IMPORTS, OUT]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

/* ---------- name normalisation ---------- */
const VERSION_WORD = /^(part i+\b.*|pre-.*|post-.*|.*timeskip.*|new era|final saga|novel|manhwa|manga|anime|webcomic|two blue vortex|naruto next generations?|.*\barc\b.*|.*\bsaga\b.*|base|adult|young|child|kid|past|present|future|dragon ball.*|super|z|gt|daima|original|movie|film|ultimate ninja.*|boruto|shippuden|prime|current|canon|.*\bera\b.*|revived|reborn|teen|teenager|elderly|old|four knights.*|vigilantes|modulo|edo tensei|toei|classic toei|dbs anime|dbs manga|db anime|db manga|.*\banime\b.*|.*\bmanga\b.*)$/i;
const IMPORTER_V = 4;
/* VS Battles page categories -> role labels (used by Mystery clues). Order = priority. */
const ROLES = [['Primary Protagonists', 'Protagonist'], ['Protagonists', 'Protagonist'], ['Main Antagonists', 'Antagonist'], ['Antagonists', 'Antagonist'],
  ['Anti-Heroes', 'Anti-hero'], ['Antiheroes', 'Anti-hero'], ['Villains', 'Villain'], ['Heroes', 'Hero'], ['Mentors', 'Mentor'], ['Rivals', 'Rival']];
const rolesOf = cats => [...new Set(ROLES.filter(([c]) => (cats || []).includes(c)).map(([, r]) => r))];   // bump when filtering/extraction rules change so cached pages are re-processed
function disambigWords(sid) {
  const s = CFG.series[sid];
  return [s.name, s.vs, ...s.canon, 'Nanatsu no Taizai', 'Kimetsu no Yaiba', 'Hunter X Hunter', 'Enen no Shouboutai', 'One-Punch Man',
    'Classroom of the Elite', 'Boku no Hero Academia', 'BnHA', 'MHA', 'Shingeki no Kyojin', 'Fullmetal Alchemist'].map(x => x.toLowerCase());
}
/* "Asta (Final Saga)" -> {name:'Asta', version:'Final Saga'}; "Ban (Nanatsu no Taizai)" -> {name:'Ban'};
   "A (Fourth Raikage)" stays a distinct name (not a version word, not a series name). */
function splitTitle(title, sid) {
  let name = title; const versions = [];
  const dis = disambigWords(sid);
  for (;;) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name); if (!m) break;
    const inner = m[2].trim(), low = inner.toLowerCase();
    if (VERSION_WORD.test(inner) || low.split(/[:,]/).some(p => VERSION_WORD.test(p.trim()))) { versions.unshift(inner); name = m[1]; continue; }
    if (dis.some(d => low === d || low.includes(d))) { name = m[1]; continue; }
    break;
  }
  return { name: name.trim(), version: versions.join(', ') || null };
}

/* ---------- one series batch ---------- */
const NONCHAR_CATS = /^(Items|Species|Weapons|Techniques|Vehicles|Locations|Objects|Artifacts|Races|Organizations|Groups|Verses|Magic Systems|Abilities)$/;
const NONCHAR_CLASS = /^(weapon|sword|item|technique|spell|ability|object|vehicle|artifact|location|power system)s?\b(?!\s*(user|master|wielder))/i;
function importSeries(sid) {
  const S = CFG.series[sid], prevFile = join(IMPORTS, sid + '.json');
  const prev = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, 'utf8')) : { pages: {} };
  const titles = categoryMembers(S.vs, { refresh });
  const pages = fetchPages(titles, { refresh });
  const out = { v: IMPORTER_V, series: sid, category: S.vs, imported: today, listed: titles.length, pages: {}, excluded: {} };
  let reused = 0;
  const exclude = (t, why) => { (out.excluded[why] = out.excluded[why] || []).push(t); };
  pages.forEach((p, i) => {
    const t = titles[i];
    if (!p) return exclude(t, 'missing');
    if (prev.v === IMPORTER_V && prev.pages[p.title] && prev.pages[p.title].revid === p.revid) { out.pages[p.title] = prev.pages[p.title]; reused++; return; }
    const w = p.wikitext;
    if (!/Tiering System\|Tier/.test(w)) return exclude(t, 'no tier (not a character profile)');
    const origin = fieldText(p, 'origin') || null, cls = fieldText(p, 'classification') || '';
    if ((p.categories || []).some(c => NONCHAR_CATS.test(c)) || NONCHAR_CLASS.test(cls)) return exclude(t, 'not a character (item, technique, species…)');
    if (!origin || !S.canon.includes(origin)) return exclude(t, 'non-canonical origin: ' + (origin || 'none'));
    if (/\((?:[^()]*\b)?(live[- ]action|stage play|musical|video games?|games?|novelization|crossover)\b[^()]*\)/i.test(t)) return exclude(t, 'non-canonical continuity (live action, stage, games)');
    const keys = keysOf(p), last = keys.length - 1;
    const pick = [last]; const bi = keys.findIndex(k => /^base$/i.test(k)); if (bi >= 0 && bi !== last) pick.unshift(bi);
    const versions = [];
    for (const ki of pick) {
      try { versions.push({ keyIndex: ki, x: extract(p, keys[ki]) }); }
      catch (e) { versions.push({ keyIndex: ki, error: e.message }); }
    }
    out.pages[p.title] = { title: p.title, revid: p.revid, timestamp: p.timestamp, fetched: p.fetched, origin, classification: cls.slice(0, 120),
      outdated: (p.categories || []).includes('Outdated Pages'), roles: rolesOf(p.categories), split: splitTitle(p.title, sid), keys, versions };
  });
  writeFileSync(prevFile, JSON.stringify(out));
  const ex = Object.values(out.excluded).reduce((a, b) => a + b.length, 0);
  console.log(`  ${sid}: ${titles.length} listed, ${Object.keys(out.pages).length} character pages (${reused} unchanged), ${ex} excluded`);
}

console.log(toImport.length ? 'Importing: ' + toImport.join(', ') : 'Rebuilding from cached imports');
for (const sid of SIDS) if (toImport.includes(sid) || !existsSync(join(IMPORTS, sid + '.json'))) importSeries(sid);

/* ---------- merge ---------- */
const legacy = JSON.parse(readFileSync(join(HERE, 'spec', 'legacy.json'), 'utf8'));
const legacyImg = new Map(), legacyPage = new Map();
for (const l of legacy) { const cid = slug(l.name.replace(/["']/g, '')); if (l.img) legacyImg.set(cid, l.img); if (l.page) legacyPage.set(l.page, cid); }
const out = [];
const pageChar = new Map();                       // VS page title -> charId (reviewer spec and legacy links win)
const nameChar = new Map();                       // series|base name -> charId, so every page of one character joins it
for (const c of VERIFIED) for (const v of c.versions) { pageChar.set(v.vsb[0], c.charId); nameChar.set(c.series + '|' + splitTitle(v.vsb[0], c.series).name, c.charId); }
for (const l of legacy) if (l.page) { const cid = slug(l.name.replace(/["']/g, '')); if (!pageChar.has(l.page)) pageChar.set(l.page, cid);
  const k = l.series + '|' + splitTitle(l.page, l.series).name; if (!nameChar.has(k)) nameChar.set(k, pageChar.get(l.page)); }
const reviewerKeys = new Set(VERIFIED.flatMap(c => c.versions.map(v => v.vsb[0] + '|' + v.vsb[1])));
const imgFor = cid => legacyImg.has(cid) ? CFG.imageBase + legacyImg.get(cid) : null;

/* reviewer-verified versions (Step 3 test set) */
for (const c of VERIFIED) for (const v of c.versions) {
  const pg0 = fetchPages([v.vsb[0]])[0], x = extract(pg0, v.vsb[1]);
  const tc = ENG.parseTier(x.stats.tier);
  out.push({ id: c.charId + '--' + v.v, charId: c.charId, name: c.name, alt: c.alt, series: c.series, form: v.form, formType: v.formType ?? null,
    roles: rolesOf(pg0.categories), continuity: c.continuity, medium: v.medium, anime: v.anime, img: imgFor(c.charId) || (c.img && imgFor(slug(c.img))) || null, desc: null,
    vsb: { url: x.vsb.url, title: x.vsb.title, key: x.vsb.key, revid: x.vsb.revid, revTimestamp: x.vsb.revTimestamp, origin: x.vsb.origin },
    stats: x.stats, canon: { refs: x.canon.refs, feats: null },
    review: { status: 'verified', by: 'reviewer', date: x.vsb.fetched, notes: [
      'Tier and key checked by a reviewer against VS Battles revision ' + x.vsb.revid + '; other statistics auto-extracted from the same revision.',
      tc.flags.length ? 'Tier text flags: ' + tc.flags.join(', ') + ' (strongest unhedged tier used).' : null,
      ...x.flags.map(f => 'Extraction: ' + f), v.animeChecked ? null : 'Anime status unconfirmed: ' + (v.animeNote || ''),
      v.animeChecked && v.animeNote ? v.animeNote : null].filter(Boolean), grades: { limitations: null } } });
}
const reviewerChars = new Set(VERIFIED.map(c => c.charId));
const BLOCK = ['estimate', 'unknown', 'varies', 'range', 'tier-11', 'unknown-tier-token', 'unparsed', 'missing'];
const charSeries = new Map(), removed = { 'same page and key as a reviewer entry': 0, 'duplicate id': 0 };
const usedIds = new Set(out.map(e => e.id));
for (const c of VERIFIED) charSeries.set(c.charId, c.series);

for (const sid of SIDS) {
  const imp = JSON.parse(readFileSync(join(IMPORTS, sid + '.json'), 'utf8')), S = CFG.series[sid];
  const plain = new Set(Object.values(imp.pages).map(p => p.split.name));
  for (const pg of Object.values(imp.pages)) {          // "Luffy (Emperor)" is a version of "Luffy" when that page exists
    const m = /^(.*?)\s*\(([^()]*)\)$/.exec(pg.split.name);
    if (m && plain.has(m[1].trim())) pg.split = { name: m[1].trim(), version: [m[2], pg.split.version].filter(Boolean).join(', ') };
  }
  for (const pg of Object.values(imp.pages)) {
    let cid = pageChar.get(pg.title) || nameChar.get(sid + '|' + pg.split.name) || slug(pg.split.name);
    if (charSeries.has(cid) && charSeries.get(cid) !== sid) cid = cid + '-' + sid;      // same name, different franchise
    charSeries.set(cid, sid);
    for (const v of pg.versions) {
      const key = pg.keys[v.keyIndex] || '';
      if (reviewerKeys.has(pg.title + '|' + key)) { removed['same page and key as a reviewer entry']++; continue; }
      const formLabel = [key, pg.split.version].filter(Boolean).join(' · ') || null;
      let id = cid + '--' + (slug(formLabel || 'base') || 'base');
      if (usedIds.has(id)) id = cid + '--' + slug((formLabel || 'base') + ' ' + pg.title);
      if (usedIds.has(id)) { removed['duplicate id']++; continue; }
      usedIds.add(id);
      const anime = S.animeDone.includes(pg.origin) ? ((S.animeOrigins || []).includes(pg.origin) ? 'anime-only' : 'shown') : S.mangaOnly.includes(pg.origin) ? 'not-shown' : 'unknown';
      const medium = (S.animeOrigins || []).includes(pg.origin) ? 'anime' : S.medium;
      const name = reviewerChars.has(cid) ? VERIFIED.find(c => c.charId === cid).name : pg.split.name;
      const base = { id, charId: cid, name, alt: [], series: sid, form: formLabel, formType: /^base$/i.test(key) ? 'base' : null,
        roles: pg.roles || [], continuity: S.name + ' (' + pg.origin + (pg.split.version && /anime|manga|toei/i.test(pg.split.version) ? ', ' + pg.split.version + ' continuity' : '') + ')', medium, anime, img: imgFor(cid), desc: null };
      if (v.error) {
        out.push({ ...base, vsb: { url: 'https://vsbattles.fandom.com/wiki/' + encodeURI(pg.title.replace(/ /g, '_')), title: pg.title, key, revid: pg.revid, origin: pg.origin },
          stats: { source: 'VS Battles Wiki (community assessment)', tier: null }, canon: { refs: [], feats: null },
          review: { status: 'needs-review', by: 'auto', date: pg.fetched, notes: ['Extraction failed: ' + v.error] } });
        continue;
      }
      const x = v.x, tier = ENG.parseTier(x.stats.tier);
      const keyIssues = x.flags.filter(f => /^(tier|ap|speed|durability):/.test(f) && !/shared by all keys/.test(f));
      const blockers = tier.flags.filter(f => BLOCK.includes(f));
      const star = tier.tier ? ENG.starOfTier(tier.tier) : null;
      const ok = tier.tier && star != null && !blockers.length && !keyIssues.length;
      out.push({ ...base,
        vsb: { url: x.vsb.url, title: x.vsb.title, key: x.vsb.key, revid: x.vsb.revid, revTimestamp: x.vsb.revTimestamp, origin: pg.origin },
        stats: x.stats, canon: { refs: x.canon.refs, feats: null },
        review: { status: ok ? 'verified' : 'needs-review', by: 'auto', date: pg.fetched, notes: [
          `Auto-imported from VS Battles revision ${pg.revid}, key "${key || '(none)'}" (${v.keyIndex === pg.keys.length - 1 ? 'latest listed key' : 'base key'}). Machine-checked, not reviewed by a person.`,
          tier.flags.length ? 'Tier text flags: ' + tier.flags.join(', ') + '.' : null,
          blockers.length ? 'Manual review: ' + blockers.join(', ') + '.' : null,
          star == null && tier.tier ? 'Manual review: tier ' + tier.tier + ' has no star mapping.' : null,
          keyIssues.length ? 'Manual review: ' + keyIssues.join('; ') : null,
          pg.outdated ? 'VS Battles marks this page as outdated.' : null,
          anime === 'unknown' ? 'Anime appearance not confirmed; excluded from Anime only.' : null,
          ...x.flags.filter(f => !keyIssues.includes(f)).map(f => 'Extraction: ' + f)].filter(Boolean), grades: { limitations: null } } });
    }
  }
}

/* legacy roster: only characters no import covers; tier-only, never playable by default */
const covered = new Set(out.map(e => e.charId));
const MANUAL = { 'Sister Lily': '10-B', 'Hawk': '10-B', 'Gowther': '4-B' };
let legacyKept = 0, legacyReplaced = 0;
for (const l of legacy) {
  const cid = slug(l.name.replace(/["']/g, ''));
  if (covered.has(cid) || (l.page && pageChar.has(l.page) && covered.has(pageChar.get(l.page)))) { legacyReplaced++; continue; }
  legacyKept++;
  const vs = Array.isArray(l.anime) ? [{ f: l.form, t: l.tier, a: 'not-shown' }, { f: l.anime[1], t: l.anime[2], a: 'shown' }] : [{ f: l.form, t: l.tier, a: l.anime === 0 ? 'not-shown' : 'shown' }];
  for (const v of vs) out.push({ id: cid + '--' + (slug(v.f || 'base') || 'base') + '-legacy', charId: cid, name: l.name, alt: [], series: l.series, form: v.f || null, formType: null, roles: [],
    continuity: CFG.series[l.series].name + ' (canon)', medium: CFG.series[l.series].medium, anime: v.a, img: l.img ? CFG.imageBase + l.img : null, desc: null,
    vsb: { url: null, title: l.page || null, key: null, revid: null }, stats: { source: 'Earlier lookup (tier only)', tier: v.t.replace(/^~/, '') },
    canon: { refs: [], feats: null },
    review: { status: 'needs-review', by: 'legacy', date: '2026-11-27', tier: MANUAL[l.name], notes: ['Legacy entry from the first version of the game: tier only, no VS Battles page matched in the import. Not playable until reviewed.'] } });
}

/* ---------- validate + write ---------- */
const built = ENG.build(out);
if (built.errors.length) { console.error('VALIDATION ERRORS (' + built.errors.length + ')\n' + built.errors.slice(0, 40).join('\n')); process.exit(1); }
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
const header = '/* GENERATED by tools/build-data.mjs — edit tools/spec/* or re-import, never hand-edit.\n   Source: VS Battles Wiki (CC BY-SA 3.0) — each entry links its page and revision. Images: AniList (hotlinked, existing entries only). */\n';
for (const sid of SIDS) {
  const list = out.filter(e => e.series === sid);
  writeFileSync(join(OUT, sid + '.js'), header + `(function (g) { const A = g.ABC = g.ABC || {}; A.characters = (A.characters || []).concat(${JSON.stringify(list)}); })(typeof window !== "undefined" ? window : globalThis);\n`);
}
const page = join(ROOT, 'index.html');
let html = readFileSync(page, 'utf8');
const tags = SIDS.map(s => `<script src="data/characters/${s}.js"></script>`).join('\n');
html = html.replace(/<!-- characters:begin -->[\s\S]*?<!-- characters:end -->|<script src="data\/characters\.js"><\/script>/, `<!-- characters:begin -->\n${tags}\n<!-- characters:end -->`);
writeFileSync(page, html);
if (existsSync(join(ROOT, 'data', 'characters.js'))) rmSync(join(ROOT, 'data', 'characters.js'));

const manifest = { generated: today, apiCallsThisRun: apiCalls(), removed, legacy: { kept: legacyKept, replaced: legacyReplaced }, series: {} };
for (const sid of SIDS) {
  const imp = JSON.parse(readFileSync(join(IMPORTS, sid + '.json'), 'utf8'));
  const es = built.entries.filter(e => e.series === sid);
  manifest.series[sid] = { category: imp.category, imported: imp.imported, listed: imp.listed, characterPages: Object.keys(imp.pages).length,
    excluded: Object.fromEntries(Object.entries(imp.excluded).map(([k, v]) => [k, v.length])),
    uniqueCharacters: new Set(es.map(e => e.charId)).size, versions: es.length,
    playableCharacters: new Set(es.filter(ENG.playable).map(e => e.charId)).size, needsReview: es.filter(e => !ENG.playable(e)).length };
}
writeFileSync(join(IMPORTS, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\n${out.length} versions, ${new Set(out.map(e => e.charId)).size} characters, ${built.entries.filter(ENG.playable).length} playable versions, ${built.warnings.length} warnings, api calls ${apiCalls()}`);
