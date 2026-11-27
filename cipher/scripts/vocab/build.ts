/**
 * Builds Cipher's vocabulary bank: src/vocab/data/bank.json (+ summary.json).
 *
 *   node --experimental-strip-types --no-warnings scripts/vocab/build.ts           # uses cached downloads
 *   node --experimental-strip-types --no-warnings scripts/vocab/build.ts --fetch   # (re)query Wikidata
 *
 * Sources (see src/vocab/SOURCES.md): Princeton WordNet 3.0 (WordNet license), Wikidata (CC0),
 * and Cipher's original curated lists in scripts/vocab/curated/. Downloads live in .cache/ (git-ignored).
 * WordNet must be extracted at .cache/wordnet/dict (WNdb-3.0.tar.gz from wordnetcode.princeton.edu).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stem } from '../../src/engine/clues.ts';
import { WORD_PACKS } from '../../src/shared/config.ts';
import { wordKey } from '../../src/shared/text.ts';
import type { BankFile, BankRow, VocabCategory, WordDifficulty } from '../../src/vocab/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const DICT = join(CACHE, 'wordnet', 'dict');
const OUT = join(HERE, '..', '..', 'src', 'vocab', 'data');
const FETCH = process.argv.includes('--fetch');
const TARGET = Object.fromEntries(WORD_PACKS.map((p) => [p.id, p.target])) as Record<VocabCategory, number>;
const WORD_RE = /^[A-Za-z]{3,12}$/;

// ---------- Curated lists ----------
const listFile = (name: string) =>
  readFileSync(join(HERE, 'curated', name), 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .flatMap((l) => l.split(/\s+/))
    .filter(Boolean);
const BLOCK = new Set(listFile('blocklist.txt').map(wordKey));
const BLOCK_GROUPS = new Set([...BLOCK].map(stem));
const STOP = new Set(listFile('stopwords.txt').map(wordKey));
const blocked = (w: string) => BLOCK.has(wordKey(w)) || BLOCK_GROUPS.has(stem(w));

// ---------- WordNet ----------
const LEX = 'adj.all adj.pert adv.all noun.Tops noun.act noun.animal noun.artifact noun.attribute noun.body noun.cognition noun.communication noun.event noun.feeling noun.food noun.group noun.location noun.motive noun.object noun.person noun.phenomenon noun.plant noun.possession noun.process noun.quantity noun.relation noun.shape noun.state noun.substance noun.time'.split(' ');
const BAD_DOMAINS = new Set(['obscenity', 'ethnic_slur', 'disparagement', 'slang', 'euphemism', 'vulgarism']);
const SKIP_DOMAINS = new Set(['archaism', 'plural', 'combining_form', 'trade_name', 'trademark']);
const SENSITIVE_GLOSS = /\b(god|goddess|deity|prophet|saint|apostle|messiah|jesus|christ|islam|muslim|jewish|judaism|hebrew|patriarch|biblical|bible|testament|hindu|buddhis|church|religio|holy|pope|caliph)/i;

interface Lemma { adjTags: number; word: string; lower: string; proper: boolean; tags: number; senses: number; lex: string; pos: 'n' | 'v'; offset: string; instance: boolean; badDomain: boolean; skipDomain: boolean; gloss: string }

function loadWordNet(): Lemma[] {
  if (!existsSync(DICT)) throw new Error(`WordNet not found at ${DICT}. Download WNdb-3.0.tar.gz and extract it there.`);
  const synsetWords = new Map<string, string[]>(); // "n:offset" -> lemmas (original case)
  const synsetInfo = new Map<string, { gloss: string; domains: string[]; instance: boolean }>();
  const glossCount = new Map<string, number>();
  const domainTargets = new Map<string, string>();
  for (const pos of ['noun', 'verb'] as const) {
    for (const line of readFileSync(join(DICT, `data.${pos}`), 'utf8').split('\n')) {
      if (!line || line.startsWith('  ')) continue;
      const [head, gloss = ''] = line.split(' | ');
      const f = head.split(' ');
      const offset = f[0];
      const n = parseInt(f[3], 16);
      const words = Array.from({ length: n }, (_, i) => f[4 + i * 2].replace(/\(.*\)$/, ''));
      const pcnt = parseInt(f[4 + n * 2], 10);
      const ptrs = Array.from({ length: pcnt }, (_, i) => f.slice(5 + n * 2 + i * 4, 9 + n * 2 + i * 4));
      const key = `${pos[0]}:${offset}`;
      synsetWords.set(key, words);
      synsetInfo.set(key, { gloss, domains: ptrs.filter((p) => p[0] === ';u').map((p) => p[1]), instance: ptrs.some((p) => p[0] === '@i') });
      for (const t of gloss.toLowerCase().match(/[a-z]+/g) ?? []) glossCount.set(t, (glossCount.get(t) ?? 0) + 1);
      if (pos === 'noun') domainTargets.set(offset, words[0].toLowerCase());
    }
  }
  const domainName = (off: string) => domainTargets.get(off) ?? '';

  // index.sense: lemma%ss_type:lexfile:lexid:: offset sense_number tag_cnt
  const agg = new Map<string, Lemma>();
  const adjTags = new Map<string, number>();
  for (const line of readFileSync(join(DICT, 'index.sense'), 'utf8').split('\n')) {
    if (!line) continue;
    const [key, offset, senseNo, tagCnt] = line.split(' ');
    const [lemma, rest] = key.split('%');
    const [ssType, lexfile] = rest.split(':');
    if (ssType === '3' || ssType === '5') {
      adjTags.set(lemma, (adjTags.get(lemma) ?? 0) + parseInt(tagCnt, 10));
      continue;
    }
    if (ssType !== '1' && ssType !== '2') continue; // nouns and verbs only
    const pos = ssType === '1' ? 'n' : 'v';
    const info = synsetInfo.get(`${pos}:${offset}`);
    if (!info) continue;
    const cased = synsetWords.get(`${pos}:${offset}`)?.find((w) => w.toLowerCase() === lemma) ?? lemma;
    const domains = info.domains.map(domainName);
    let l = agg.get(lemma);
    if (!l) {
      l = { adjTags: 0, word: cased, lower: lemma, proper: /^[A-Z]/.test(cased), tags: 0, senses: 0, lex: '', pos, offset, instance: false, badDomain: false, skipDomain: false, gloss: '' };
      agg.set(lemma, l);
    }
    if (!/^[A-Z]/.test(cased)) l.proper = false; // has a common-noun sense
    const tags = parseInt(tagCnt, 10);
    l.senses += 1;
    if (domains.some((d) => BAD_DOMAINS.has(d))) l.badDomain = true;
    // Primary sense: most tagged; ties keep noun sense 1.
    const primaryTags = l.lex ? (l as Lemma & { _pt?: number })._pt ?? 0 : -1;
    if (tags > primaryTags || (!l.lex && senseNo === '1')) {
      Object.assign(l, { lex: LEX[parseInt(lexfile, 10)] ?? `verb.${lexfile}`, pos, offset, instance: info.instance, gloss: info.gloss, skipDomain: domains.some((d) => SKIP_DOMAINS.has(d)), _pt: tags });
    }
    l.tags += tags;
  }
  return [...agg.values()].map((l) => ({ ...l, adjTags: adjTags.get(l.lower) ?? 0, glossFreq: glossCount.get(l.lower) ?? 0 }) as Lemma & { glossFreq: number });
}

type Cand = { word: string; category: VocabCategory; score: number; source: 'w' | 'd' | 'c'; sensitive: boolean };

function categoryOf(l: Lemma): VocabCategory | null {
  if (l.pos === 'v') return l.proper ? null : 'general';
  switch (l.lex) {
    case 'noun.artifact': return l.proper ? null : 'objects';
    case 'noun.person': return l.proper ? (l.instance ? 'science_history' : null) : 'objects';
    case 'noun.animal': case 'noun.plant': return l.proper ? null : 'nature';
    case 'noun.object': return l.proper ? 'geography' : 'nature';
    case 'noun.phenomenon': return l.proper ? null : 'nature';
    case 'noun.location': return 'geography';
    case 'noun.substance': case 'noun.process': case 'noun.body': return l.proper ? null : 'science_history';
    case 'noun.event': return 'science_history';
    case 'noun.group': case 'noun.time': return l.proper ? 'science_history' : 'general';
    default: return l.proper ? null : 'general';
  }
}

function wordnetCandidates(): Cand[] {
  const out: Cand[] = [];
  for (const l of loadWordNet() as (Lemma & { glossFreq: number })[]) {
    if (!WORD_RE.test(l.word) || l.badDomain || l.skipDomain) continue;
    if (STOP.has(l.lower) || blocked(l.word)) continue;
    if (l.word === l.word.toUpperCase()) continue; // acronyms (USSR, NATO)
    if (l.proper && l.word.length <= 3) continue; // abbreviations (Feb, Leo)
    if (l.adjTags > l.tags) continue; // mainly an adjective (stoic, metallic)
    // Proper names outside geography must be notable: mentioned in other WordNet definitions.
    if (l.proper && l.lex !== 'noun.location' && l.lex !== 'noun.object' && l.glossFreq < 3) continue;
    const category = categoryOf(l);
    if (!category) continue;
    const score = 2.2 * Math.log1p(l.tags) + Math.log1p(l.glossFreq) + 0.6 * Math.log(l.senses) - Math.max(0, l.word.length - 9) * 0.3;
    if (score < 1.2) continue; // essentially unknown words
    out.push({ word: l.word, category, score, source: 'w', sensitive: SENSITIVE_GLOSS.test(l.gloss) });
  }
  return out;
}

// ---------- Wikidata (CC0) ----------
const ANIME = 'wd:Q63952888 wd:Q21198342 wd:Q20650540 wd:Q1107 wd:Q8274';
const QUERIES: { name: string; category: VocabCategory; minLinks: number; where: string }[] = [
  { name: 'anime-works', category: 'anime', minLinks: 8, where: `VALUES ?cls { ${ANIME} } ?item wdt:P31 ?cls .` },
  { name: 'anime-characters', category: 'anime', minLinks: 4, where: `VALUES ?cls { ${ANIME} } ?work wdt:P31 ?cls . ?item wdt:P1441 ?work .` },
  { name: 'games', category: 'gaming', minLinks: 20, where: '?item wdt:P31 wd:Q7889 .' },
  { name: 'game-characters', category: 'gaming', minLinks: 6, where: '?work wdt:P31 wd:Q7889 . ?item wdt:P1441 ?work .' },
  { name: 'game-franchises', category: 'gaming', minLinks: 8, where: '?item wdt:P31 wd:Q7058673 .' },
  { name: 'films', category: 'entertainment', minLinks: 30, where: '?item wdt:P31 wd:Q11424 .' },
  { name: 'tv-series', category: 'entertainment', minLinks: 25, where: '?item wdt:P31 wd:Q5398426 .' },
  { name: 'screen-characters', category: 'entertainment', minLinks: 10, where: 'VALUES ?cls { wd:Q11424 wd:Q5398426 } ?work wdt:P31 ?cls . ?item wdt:P1441 ?work .' },
];

async function wikidata(q: (typeof QUERIES)[number]): Promise<{ label: string; links: number }[]> {
  const file = join(CACHE, 'wikidata', `${q.name}.json`);
  if (!existsSync(file) || FETCH) {
    const sparql = `SELECT DISTINCT ?item ?label ?links WHERE { ${q.where} ?item wikibase:sitelinks ?links . FILTER(?links >= ${q.minLinks}) ?item rdfs:label ?label FILTER(lang(?label) = "en") FILTER(REGEX(?label, "^[A-Za-z]{3,12}$")) }`;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'CipherVocabBuilder/0.1 (word-game vocabulary build)' } });
      if (res.ok) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, await res.text());
        break;
      }
      if (attempt >= 3) throw new Error(`Wikidata ${q.name}: HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  const json = JSON.parse(readFileSync(file, 'utf8')) as { results: { bindings: { label: { value: string }; links: { value: string } }[] } };
  return json.results.bindings.map((b) => ({ label: b.label.value, links: parseInt(b.links.value, 10) }));
}

async function wikidataCandidates(): Promise<Cand[]> {
  const out: Cand[] = [];
  for (const q of QUERIES) {
    for (const { label, links } of await wikidata(q)) {
      if (!WORD_RE.test(label) || STOP.has(wordKey(label)) || blocked(label) || label === label.toUpperCase()) continue;
      out.push({ word: label, category: q.category, score: Math.log1p(links), source: 'd', sensitive: false });
    }
  }
  return out;
}

function curatedCandidates(): Cand[] {
  const lists: [string, VocabCategory][] = [['anime.txt', 'anime'], ['gaming.txt', 'gaming'], ['entertainment.txt', 'entertainment']];
  return lists.flatMap(([file, category]) =>
    listFile(file)
      .filter((w) => WORD_RE.test(w) && !blocked(w))
      .map((word) => ({ word, category, score: 100, source: 'c' as const, sensitive: false })),
  );
}

// ---------- Assembly ----------
interface Built { word: string; group: string; category: VocabCategory; tags: Set<VocabCategory>; difficulty: WordDifficulty; sensitive: boolean; source: 'w' | 'd' | 'c'; score: number }

function difficultyByRank(rank: number, total: number, cat: VocabCategory): WordDifficulty {
  const p = rank / Math.max(1, total);
  if (cat === 'advanced') return p < 0.3 ? 'medium' : 'hard';
  return p < 0.45 ? 'easy' : p < 0.85 ? 'medium' : 'hard';
}

async function main() {
  const wn = wordnetCandidates();
  const wd = await wikidataCandidates();
  const cu = curatedCandidates();
  const byKey = new Map<string, Built>();
  const report: Record<string, number> = { wordnetCandidates: wn.length, wikidataCandidates: wd.length, curatedCandidates: cu.length };

  // 1. WordNet categories: best `target` per category by score. Leftovers feed Advanced.
  const leftovers: Cand[] = [];
  const primaryCats: VocabCategory[] = ['general', 'objects', 'nature', 'geography', 'science_history'];
  for (const cat of primaryCats) {
    const pool = wn.filter((c) => c.category === cat).sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const picked: Cand[] = [];
    for (const c of pool) {
      const k = wordKey(c.word);
      if (seen.has(k) || byKey.has(k)) continue;
      seen.add(k);
      if (picked.length < TARGET[cat]) picked.push(c);
      else leftovers.push(c);
    }
    picked.forEach((c, i) => byKey.set(wordKey(c.word), { word: c.word.toUpperCase(), group: stem(c.word), category: cat, tags: new Set(), difficulty: difficultyByRank(i, picked.length, cat), sensitive: c.sensitive, source: 'w', score: c.score }));
  }
  // 2. Advanced: the most recognizable remaining WordNet words of 6+ letters (rarer than the category picks).
  const adv = leftovers.filter((c) => c.word.length >= 6 && !/^[A-Z]/.test(c.word) && c.score >= 2.5).sort((a, b) => b.score - a.score);
  let advN = 0;
  for (const c of adv) {
    const k = wordKey(c.word);
    if (byKey.has(k) || advN >= TARGET.advanced) continue;
    byKey.set(k, { word: c.word.toUpperCase(), group: stem(c.word), category: 'advanced', tags: new Set(), difficulty: 'hard', sensitive: c.sensitive, source: 'w', score: c.score });
    advN++;
  }
  const advEntries = [...byKey.values()].filter((b) => b.category === 'advanced').sort((a, b) => b.score - a.score);
  advEntries.forEach((b, i) => (b.difficulty = difficultyByRank(i, advEntries.length, 'advanced')));

  // 3. Specialized packs: curated terms first, then Wikidata by fame. Existing words gain a tag instead of a duplicate.
  for (const cat of ['anime', 'gaming', 'entertainment'] as const) {
    const pool = [...cu.filter((c) => c.category === cat), ...wd.filter((c) => c.category === cat).sort((a, b) => b.score - a.score)];
    const own: Built[] = [];
    for (const c of pool) {
      const k = wordKey(c.word);
      const existing = byKey.get(k);
      if (existing) {
        if (existing.category !== cat) existing.tags.add(cat);
        continue;
      }
      if (own.length >= TARGET[cat]) continue;
      const b: Built = { word: c.word.toUpperCase(), group: stem(c.word), category: cat, tags: new Set(), difficulty: 'medium', sensitive: false, source: c.source, score: c.score };
      own.push(b);
      byKey.set(k, b);
    }
    // Difficulty: curated terms and the most famous titles/characters are easier.
    const ranked = own.filter((b) => b.source === 'd');
    ranked.forEach((b, i) => (b.difficulty = difficultyByRank(i, ranked.length, cat)));
    own.filter((b) => b.source === 'c').forEach((b) => (b.difficulty = 'easy'));
  }

  const entries = [...byKey.values()].sort((a, b) => a.category.localeCompare(b.category) || a.word.localeCompare(b.word));
  const rows: BankRow[] = entries.map((b) => [b.word, b.group, b.category, [...b.tags].sort().join(','), b.difficulty[0] as 'e' | 'm' | 'h', b.sensitive ? 'x' : 's', b.source[0] as 'w' | 'd' | 'c']);
  const file: BankFile = { version: `v1-${entries.length}`, language: 'en', generatedAt: new Date().toISOString().slice(0, 10), rows };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'bank.json'), JSON.stringify(file));

  const count = (f: (b: Built) => boolean) => entries.filter(f).length;
  const summary = {
    version: file.version,
    total: entries.length,
    safe: count((b) => !b.sensitive),
    sensitive: count((b) => b.sensitive),
    byCategory: Object.fromEntries(WORD_PACKS.map((p) => [p.id, { target: p.target, primary: count((b) => b.category === p.id), packSize: count((b) => !b.sensitive && (b.category === p.id || b.tags.has(p.id))) }])),
    byDifficulty: { easy: count((b) => b.difficulty === 'easy'), medium: count((b) => b.difficulty === 'medium'), hard: count((b) => b.difficulty === 'hard') },
    bySource: { wordnet: count((b) => b.source === 'w'), wikidata: count((b) => b.source === 'd'), cipher: count((b) => b.source === 'c') },
    candidates: report,
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  // Runtime safety filter for host-imported custom word lists (normalized words and root groups).
  writeFileSync(join(OUT, 'blocklist.json'), JSON.stringify({ words: [...BLOCK].sort(), groups: [...BLOCK_GROUPS].sort() }) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

await main();
