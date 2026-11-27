// VS Battles Wiki research tool: fetch a profile through the public MediaWiki API, cache it, and extract
// one profile key's statistics as concise structured text. Never runs during a match.
//
//   node tools/vsb.mjs "Satoru Gojo"              list keys + tier per key
//   node tools/vsb.mjs "Satoru Gojo" Present      print the extracted entry for one key
//   add --refresh to ignore the cache
//
// Access: api.php (the supported read API), one request at a time, >= 1.5 s apart, descriptive User-Agent.
// Licence: VS Battles text is CC BY-SA; we keep short factual summaries plus the page URL and revision id.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadABC } from './load.mjs';
import { fetchPages } from './api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'cache');
const UA = 'RecessDevTool/1.0 (offline character data import; low volume)';
let last = 0;

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function fetchPage(title, { refresh = false } = {}) {
  const p = fetchPages([title], { refresh })[0];
  if (!p) throw new Error('No VS Battles page: ' + title);
  return p;
}

/* ---------- wikitext helpers ---------- */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripRefs = s => s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
function balancedStrip(s, open = '(', close = ')') {
  let out = '', d = 0;
  for (const ch of s) { if (ch === open) d++; else if (ch === close && d) { d--; continue; } if (!d) out += ch; }
  return out;
}
export function clean(s, { keepParens = false } = {}) {
  if (s == null) return null;
  let t = stripRefs(s);
  t = t.replace(/\{\{(?:Border|#tag:tabber)[^{}]*?Content=/g, '').replace(/<\/?tabber>/g, '').replace(/\{\{!\}\}-\{\{!\}\}[^=\n]*=/g, '');
  t = t.replace(/\{\{([^{}|]*)(\|[^{}]*)?\}\}/g, '$1');            // {{7-B}} -> 7-B
  t = t.replace(/\{\{|\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');             // [[a|b]] -> b
  t = t.replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
  t = t.replace(/'''|''/g, '').replace(/<[^>]+>/g, '');
  if (!keepParens) t = balancedStrip(t);
  return t.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
}
const short = (s, n = 240) => !s ? null : s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…';

const FIELD = {
  tier: /'''\[\[Tiering System\|Tier\]\]:?'''\s*:?/, key: /'''Key:?'''\s*:?/, ap: /'''\[\[Attack Potency\]\]:?(?:''')?\s*:?/,
  speed: /'''\[\[Speed\]\]:?(?:''')?\s*:?/, lifting: /'''\[\[Lifting Strength\]\]:?(?:''')?\s*:?/, striking: /'''\[\[Striking Strength\]\]:?(?:''')?\s*:?/,
  durability: /'''\[\[Durability\]\]:?(?:''')?\s*:?/, stamina: /'''\[\[Stamina\]\]:?(?:''')?\s*:?/, range: /'''\[\[Range\]\]:?(?:''')?\s*:?/,
  intelligence: /'''\[\[Intelligence\]\]:?(?:''')?\s*:?/, weaknesses: /'''\[?\[?Weaknesses\]?\]?:?'''\s*:?/,
  pna: /'''(?:\[\[)?Powers and Abilities(?:\]\])?:?'''\s*:?/,
  origin: /'''Origin:?'''\s*:?/, classification: /'''Classification:?'''\s*:?/
};
function field(w, k) {
  const m = FIELD[k].exec(w); if (!m) return null;
  const start = m.index + m[0].length;
  const rest = w.slice(start);
  const stop = k === 'pna' ? rest.search(/\n'''\[\[Attack Potency\]\]|\n\|-\|[^=\n▾]+=(?!\n\{\{#tag)'''/) : rest.search(/\n\s*\n'''|\n'''[A-Z\[]|\n==|\n\{\||\|-\|/);
  return rest.slice(0, stop < 0 ? undefined : stop).trim();
}
/* Split a field into per-key parts on top-level " | " (outside [[ ]], {{ }}, <ref>). */
function splitKeys(s) {
  if (s == null) return [];
  const t = stripRefs(s); const parts = []; let d = 0, cur = '';
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 2);
    if (two === '[[' || two === '{{') { d++; cur += two; i++; continue; }
    if ((two === ']]' || two === '}}') && d) { d--; cur += two; i++; continue; }
    if (!d && t.slice(i, i + 3) === ' | ') { parts.push(cur); cur = ''; i += 2; continue; }
    cur += t[i];
  }
  parts.push(cur);
  return parts.map(x => x.trim());
}
function pickKey(s, keys, idx, flags, name) {
  const parts = splitKeys(s);
  if (!parts.length) return null;
  if (parts.length === 1) { if (keys.length > 1 && ['tier', 'ap', 'speed', 'durability'].includes(name)) flags.push(name + ': one value shared by all keys'); return parts[0]; }
  if (parts.length === keys.length) return parts[idx];
  flags.push(name + ': ' + parts.length + ' parts for ' + keys.length + ' keys, used the last part');
  return parts[parts.length - 1];
}
function refsOf(s) {
  const out = [];
  for (const m of (s || '').matchAll(/<ref[^>/]*>([\s\S]*?)<\/ref>/g)) {
    const r = clean(m[1], { keepParens: true });
    if (r && /(Chapter|Episode|Volume|Vol\.|Season|Light Novel|Novel)/i.test(r) && r.length < 160 && !out.includes(r)) out.push(r);
  }
  return out;
}
/* Tabs: VS profiles use "|-|Name=" or "{{!}}-{{!}}Name=" (optionally "Name ▾="). The same name can be an image
   tab, an abilities tab and a statistics tab; `must` picks the occurrence whose section contains that text. */
function keySection(text, key, keys, must) {
  if (!text || !key) return null;
  const names = keys.filter(Boolean).map(esc).join('|');
  const re = new RegExp('(?:\\|-\\||\\{\\{!\\}\\}-\\{\\{!\\}\\})(' + names + ')(?: ▾)?=', 'g');
  const heads = [...text.matchAll(re)].map(m => ({ k: m[1], at: m.index, body: m.index + m[0].length }));
  for (let i = 0; i < heads.length; i++) {
    if (heads[i].k !== key) continue;
    const next = heads.slice(i + 1).find(h => h.k !== key);
    let sec = text.slice(heads[i].body, next ? next.at : undefined);
    const end = sec.search(/<\/tabber>|\n\|-\|(?:Victories|Losses|Inconclusive)=/);
    if (end >= 0) sec = sec.slice(0, end);
    if (!must || sec.includes(must)) return sec;
  }
  return null;
}
function abilityNames(pna, keyName, allKeys = []) {
  if (!pna) return { abilities: [], resistances: [], regeneration: null, scope: 'none' };
  let scope = 'all', text = pna;
  const tabOf = k => keySection(pna, k, allKeys, null);
  if (keyName) {
    const own = tabOf(keyName);
    if (own) {
      scope = 'key tab'; text = own;
      // VS convention: a later key that says "all previous abilities" inherits the earlier keys' lists.
      if (/previous/i.test(own)) { const before = allKeys.slice(0, allKeys.indexOf(keyName)).map(tabOf).filter(Boolean); text = before.join('\n') + '\n' + own; scope = 'key tab + earlier keys'; }
    }
  }
  text = stripRefs(text);
  const abilities = [], resist = [];
  let regen = null;
  const regenLevels = ['Low', 'Mid-Low', 'High-Low', 'Low-Mid', 'Mid', 'High-Mid', 'Low-High', 'Mid-High', 'High', 'Low-Godly', 'Mid-Godly', 'High-Godly'];
  let resistMode = false;
  for (const rawLine of text.split('\n')) {
    const line = balancedStrip(rawLine);
    const links = [...line.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim()).filter(n => !/^(File|Image|Category|User|User blog):/i.test(n));
    if (/Resistance\]\]'*\s*(to|against)/i.test(line) || /resist/i.test(line)) {
      resistMode = /Resistance\]\]'*\s*(to|against)\s*:?\s*$/i.test(line.trim());
      for (const n of links) if (!/Resistance$/i.test(n) && !resist.includes(n)) resist.push(n);
      continue;
    }
    if (resistMode && /^\*/.test(line)) { for (const n of links) if (!/Resistance$/i.test(n) && !resist.includes(n)) resist.push(n); continue; }
    resistMode = false;
    for (const n of links) {
      if (n === 'Regeneration') {
        const m = /Regeneration\]\]'*\s*\(?'*\s*([A-Za-z]+(?:-[A-Za-z]+)?)/.exec(rawLine);
        const lv = m && regenLevels.find(x => x.toLowerCase() === m[1].toLowerCase());
        if (lv && (!regen || regenLevels.indexOf(lv) > regenLevels.indexOf(regen))) regen = lv;
      }
    }
    // VS convention: abilities are bolded links ('''[[Ability]]''' or '''[[Ability|label]]''').
    for (const m of line.matchAll(/'''\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]'''/g)) {
      const n = m[1].trim();
      if (!/^(File|Image|Category|User|User blog|vsforum):/i.test(n) && !/Resistance$/i.test(n) && !abilities.includes(n) && /[A-Z]/.test(n[0])) abilities.push(n);
    }
  }
  return { abilities, resistances: resist, regeneration: regen, scope };
}

/* Extract one key of a profile. Returns {vsb, stats, canon, flags}. */
export function keysOf(page) { const k = field(page.wikitext, 'key'); return k ? splitKeys(k).map(x => clean(x)) : ['']; }
export function fieldText(page, name) { return clean(field(page.wikitext, name)); }
export function extract(page, keyName) {
  const ABC = loadABC();
  const w = page.wikitext, flags = [];
  const keysRaw = field(w, 'key');
  const keys = keysRaw ? splitKeys(keysRaw).map(k => clean(k)) : [''];
  let idx = keyName == null || keyName === '' ? keys.length - 1 : keys.findIndex(k => k.toLowerCase() === String(keyName).toLowerCase());
  if (idx < 0) throw new Error(`Key "${keyName}" not on ${page.title}. Keys: ${keys.join(' | ')}`);
  const key = keys[idx];
  // Many profiles put each key's statistics in its own tab ("|-|Present=..."); read only that tab when it exists.
  const statsText = keys.length > 1 ? keySection(w, key, keys, "[[Attack Potency]]") : null;
  const tab = !!statsText;
  if (!tab && keys.length > 1) flags.push('stats: no per-key tab, split shared fields by " | "');
  const get = k => k === 'tier' ? pickKey(field(w, k), keys, idx, flags, k) : (tab && field(statsText, k)) || pickKey(field(w, k), keys, idx, flags, k);
  const tierRaw = get('tier'), apRaw = get('ap'), spRaw = get('speed'), duRaw = get('durability');
  const spText = clean(spRaw);
  const durability = clean(duRaw);
  const pna = abilityNames(field(w, 'pna'), key, keys);
  const hax = pna.abilities.filter(a => a in ABC.config.hax);
  // Speed: split combat / reaction / travel phrases; travel and flight never count as combat speed.
  const sp = { combat: null, reaction: null, travel: null };
  if (spText) {
    for (const seg of spText.split(/,(?![^()]*\))|\. /)) {
      const s = seg.trim(); if (!s) continue;
      if (/travel|flight|flying/i.test(s)) sp.travel = sp.travel ? sp.travel + ', ' + s : s;
      else if (/combat|attack speed/i.test(s)) { sp.combat = sp.combat ? sp.combat + ', ' + s : s; if (/reaction/i.test(s)) sp.reaction = sp.reaction || s; }
      else if (/^(.*?)\s+(?:with|and)\s+(.*reactions?.*)$/i.test(s) && !/reaction/i.test(s.split(/\s+(?:with|and)\s+/i)[0])) {
        const [, a, b] = /^(.*?)\s+(?:with|and)\s+(.*reactions?.*)$/i.exec(s);
        sp.combat = sp.combat ? sp.combat + ', ' + a : a; sp.reaction = sp.reaction ? sp.reaction + ', ' + b : b;
      }
      else if (/reaction/i.test(s)) sp.reaction = sp.reaction ? sp.reaction + ', ' + s : s;
      else sp.combat = sp.combat ? sp.combat + ', ' + s : s;
    }
    for (const k of Object.keys(sp)) sp[k] = short(sp[k], 160);
  }
  return {
    vsb: { url: 'https://vsbattles.fandom.com/wiki/' + encodeURI(page.title.replace(/ /g, '_')), title: page.title, key, keyIndex: idx, keys, revid: page.revid, revTimestamp: page.timestamp, fetched: page.fetched,
      origin: clean(field(w, 'origin')) || null, classification: short(clean(field(w, 'classification')), 120) },
    stats: {
      source: 'VS Battles Wiki (community assessment)',
      tier: clean(tierRaw),
      ap: short(clean(apRaw)),
      speed: sp,
      durability: short(durability),
      durabilityTier: ABC.engine.levelToTier(durability),
      striking: short(clean(get('striking')), 160),
      lifting: short(clean(get('lifting')), 160),
      stamina: short(clean(get('stamina')), 160),
      range: short(clean(get('range')), 200),
      intelligence: short(clean(get('intelligence')), 200),
      experience: null,
      abilities: pna.abilities.length ? pna.abilities.slice(0, 14) : null,
      hax: pna.abilities.length ? hax : null,                // [] = none found among listed abilities; null = not extracted
      resistances: pna.resistances.length ? pna.resistances.slice(0, 16) : null,
      regeneration: pna.regeneration,
      weaknesses: short(clean(get('weaknesses')), 260)
    },
    canon: { refs: [...refsOf(apRaw), ...refsOf(spRaw), ...refsOf(duRaw)].filter((r, i, a) => a.indexOf(r) === i).slice(0, 6) },
    flags: [...flags, ...(pna.scope === 'all' && keys.length > 1 ? ['abilities: no per-key tab, page-wide list'] : [])]
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter(a => a !== '--refresh');
  const refresh = process.argv.includes('--refresh');
  const page = fetchPage(args[0], { refresh });
  if (args.length < 2) {
    const ABC = loadABC();
    const keys = splitKeys(field(page.wikitext, 'key') || '').map(k => clean(k));
    const tiers = splitKeys(field(page.wikitext, 'tier') || '').map(t => clean(t));
    console.log(page.title, 'rev', page.revid);
    (keys.length ? keys : ['(no key)']).forEach((k, i) => console.log(' ', i, k, '=>', tiers.length === keys.length ? tiers[i] : tiers.join(' | '), '→', JSON.stringify(ABC.engine.parseTier(tiers.length === keys.length ? tiers[i] : tiers.at(-1)))));
  } else console.log(JSON.stringify(extract(page, args[1]), null, 1));
}
