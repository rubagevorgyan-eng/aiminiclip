import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stem } from '../engine/clues.ts';
import { createCompetitiveMatch } from '../engine/competitive.ts';
import { BOARD_SIZES, DEFAULT_PACKS, DIFFICULTIES, UNLIMITED_TIMER, WORD_PACKS, competitiveLayout } from '../shared/config.ts';
import { cryptoRng, seededRng } from '../shared/random.ts';
import { wordKey } from '../shared/text.ts';
import type { BoardSize, CompetitiveIdentity, VocabCategory } from '../shared/types.ts';
import summary from './data/summary.json' with { type: 'json' };
import { inPacks } from './bank.ts';
import { BoardError, conflicts, defaultBank, generateBoardWords, rememberBoard, tierCounts } from './index.ts';
import type { VocabularyBank, VocabularyEntry } from './types.ts';

const bank = defaultBank();
const list = (name: string) =>
  readFileSync(new URL(`../../scripts/vocab/curated/${name}`, import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.startsWith('#')).flatMap((l) => l.split(/\s+/)).filter(Boolean).map(wordKey);

// ---------- Vocabulary ----------
test('bank: entry shape, uniqueness and normalization', () => {
  const ids = new Set<string>();
  const keys = new Set<string>();
  const cats = new Set<string>(WORD_PACKS.map((p) => p.id));
  for (const e of bank.entries) {
    assert.match(e.word, /^[A-Z]{3,12}$/, e.word);
    assert.equal(e.normalized, wordKey(e.word));
    assert.equal(e.id, `w_${e.normalized}`);
    assert.equal(e.group, stem(e.word), `group for ${e.word}`);
    assert.ok(cats.has(e.category), e.category);
    assert.ok(e.tags.every((t) => cats.has(t) && t !== e.category));
    assert.ok(['easy', 'medium', 'hard'].includes(e.difficulty));
    assert.ok(['safe', 'sensitive'].includes(e.safety));
    assert.equal(e.language, 'en');
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    assert.ok(!keys.has(e.normalized), `duplicate word ${e.word}`);
    ids.add(e.id);
    keys.add(e.normalized);
  }
});

test('bank: actual counts match the published summary (validated, not assumed)', () => {
  const count = (f: (e: VocabularyEntry) => boolean) => bank.entries.filter(f).length;
  assert.equal(bank.entries.length, summary.total);
  assert.equal(count((e) => e.safety === 'safe'), summary.safe);
  for (const p of WORD_PACKS) {
    const s = (summary.byCategory as Record<string, { primary: number; packSize: number; target: number }>)[p.id];
    assert.equal(count((e) => e.category === p.id), s.primary, `${p.id} primary`);
    assert.equal(count((e) => e.safety === 'safe' && inPacks(e, new Set([p.id]))), s.packSize, `${p.id} pack`);
    assert.ok(s.primary <= p.target, `${p.id} never exceeds its target`);
  }
  for (const d of ['easy', 'medium', 'hard'] as const) assert.equal(count((e) => e.difficulty === d), summary.byDifficulty[d]);
  assert.equal(bank.entries.length, 10_000, 'current build: 10,000 entries');
});

test('bank: no blocked words, filler words or blocked root groups', () => {
  const blocked = new Set(list('blocklist.txt'));
  const blockedGroups = new Set([...blocked].map(stem));
  const stop = new Set(list('stopwords.txt'));
  for (const e of bank.entries) {
    assert.ok(!blocked.has(e.normalized) && !blockedGroups.has(e.group), `blocked: ${e.word}`);
    assert.ok(!stop.has(e.normalized), `filler: ${e.word}`);
  }
});

test('bank: every standard pack and every difficulty tier can fill a 10×10 board', () => {
  const std = new Set<VocabCategory>(DEFAULT_PACKS);
  const safe = bank.entries.filter((e) => e.safety === 'safe' && inPacks(e, std));
  for (const d of ['easy', 'medium', 'hard'] as const) assert.ok(safe.filter((e) => e.difficulty === d).length >= 100, `${d} tier`);
  assert.deepEqual([...DEFAULT_PACKS].sort(), ['general', 'geography', 'nature', 'objects', 'science_history']);
});

// ---------- Layout ----------
test('layout: proposed Cipher balance for 5×5 to 10×10 with one mole', () => {
  const expected: Record<number, [number, number, number]> = { 5: [9, 8, 7], 6: [13, 12, 10], 7: [17, 16, 15], 8: [23, 22, 18], 9: [29, 28, 23], 10: [35, 34, 30] };
  for (const size of BOARD_SIZES) {
    const l = competitiveLayout(size, 1);
    assert.deepEqual([l.starting, l.second, l.civilians], expected[size], `${size}×${size}`);
    assert.equal(l.starting + l.second + l.civilians + l.moles, size * size);
  }
  assert.deepEqual(competitiveLayout(5), competitiveLayout(5, 1), 'one mole by default');
});

test('layout: configurable moles and agent ratio', () => {
  const l = competitiveLayout(10, 3);
  assert.deepEqual([l.starting, l.second, l.civilians, l.moles], [34, 33, 30, 3]); // floor(97 × 0.35) = 33
  const custom = competitiveLayout(6, 1, { agentPercent: 30 });
  assert.deepEqual([custom.starting, custom.second], [11, 10]); // floor(35 × 0.30) = 10
  assert.equal(competitiveLayout(5, 99).moles, 5, 'clamped to the allowed range (1–5)');
});

test('engine identity counts follow the layout on every board size', () => {
  for (const size of BOARD_SIZES) {
    const words = generateBoardWords(bank, { size, packs: DEFAULT_PACKS, difficulty: 'balanced' }, seededRng(`w${size}`)).entries.map((e) => e.word);
    const m = createCompetitiveMatch({ id: 'm', mode: 'custom', settings: { boardSize: size, moles: null, startingTeam: 'crimson', timer: UNLIMITED_TIMER }, words, rng: seededRng(`k${size}`), seed: 'k', now: 0 });
    const ids = (m.key as { identities: CompetitiveIdentity[] }).identities;
    const l = competitiveLayout(size);
    const n = (x: CompetitiveIdentity) => ids.filter((i) => i === x).length;
    assert.deepEqual([n('crimson'), n('cobalt'), n('civilian'), n('mole')], [l.starting, l.second, l.civilians, l.moles]);
  }
});

// ---------- Difficulty ----------
test('difficulty mixes: exact counts per board size', () => {
  assert.deepEqual(tierCounts(25, 'easy'), { easy: 20, medium: 5, hard: 0 });
  assert.deepEqual(tierCounts(25, 'balanced'), { easy: 10, medium: 12, hard: 3 });
  assert.deepEqual(tierCounts(25, 'hard'), { easy: 5, medium: 10, hard: 10 });
  assert.deepEqual(tierCounts(25, 'expert'), { easy: 0, medium: 10, hard: 15 });
  assert.deepEqual(tierCounts(100, 'balanced'), { easy: 40, medium: 48, hard: 12 });
  for (const d of DIFFICULTIES) {
    for (const size of BOARD_SIZES) {
      const c = tierCounts(size * size, d.id);
      assert.equal(c.easy + c.medium + c.hard, size * size);
      for (const t of ['easy', 'medium', 'hard'] as const) {
        if (d.mix[t] === 0) assert.equal(c[t], 0, `${d.id} has no ${t}`);
        assert.ok(Math.abs(c[t] - (size * size * d.mix[t]) / 100) < 1, `${d.id} ${t} within rounding`);
      }
    }
  }
});

// ---------- Board generation ----------
function assertBoard(entries: VocabularyEntry[], cards: number, packs: Set<VocabCategory>) {
  assert.equal(entries.length, cards);
  assert.equal(new Set(entries.map((e) => e.normalized)).size, cards, 'no duplicates');
  for (let i = 0; i < entries.length; i++) {
    assert.equal(entries[i].safety, 'safe');
    assert.ok(inPacks(entries[i], packs), `${entries[i].word} outside selected packs`);
    for (let j = i + 1; j < entries.length; j++) assert.ok(!conflicts(entries[i], entries[j]), `${entries[i].word} vs ${entries[j].word}`);
  }
}

test('boards: every size × difficulty, distinct, conflict-free, exact difficulty mix', () => {
  const packs = new Set<VocabCategory>(DEFAULT_PACKS);
  for (const size of BOARD_SIZES) {
    for (const d of DIFFICULTIES) {
      const { entries, notes } = generateBoardWords(bank, { size, packs: DEFAULT_PACKS, difficulty: d.id }, seededRng(`${size}-${d.id}`));
      assertBoard(entries, size * size, packs);
      const want = tierCounts(size * size, d.id);
      for (const t of ['easy', 'medium', 'hard'] as const) assert.equal(entries.filter((e) => e.difficulty === t).length, want[t], `${size} ${d.id} ${t}`);
      assert.deepEqual(notes, []);
    }
  }
});

test('boards: specialized packs stay within themselves', () => {
  for (const pack of ['anime', 'gaming', 'entertainment'] as const) {
    const { entries } = generateBoardWords(bank, { size: 10 as BoardSize, packs: [pack], difficulty: 'balanced' }, seededRng(pack));
    assertBoard(entries, 100, new Set([pack]));
  }
});

test('boards: deterministic with a seed, varied across seeds, secure rng works', () => {
  const req = { size: 5 as BoardSize, packs: DEFAULT_PACKS, difficulty: 'balanced' as const };
  const a = generateBoardWords(bank, req, seededRng('same')).entries.map((e) => e.id);
  assert.deepEqual(a, generateBoardWords(bank, req, seededRng('same')).entries.map((e) => e.id));
  assert.notDeepEqual(a, generateBoardWords(bank, req, seededRng('other')).entries.map((e) => e.id));
  assertBoard(generateBoardWords(bank, req, cryptoRng()).entries, 25, new Set(DEFAULT_PACKS));
  const r = cryptoRng();
  for (let i = 0; i < 500; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});

test('boards: recent words are avoided across matches in a room', () => {
  let recent: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const { entries } = generateBoardWords(bank, { size: 5, packs: DEFAULT_PACKS, difficulty: 'balanced', recent }, seededRng(`room${i}`));
    for (const e of entries) assert.ok(!seen.has(e.id), `repeated ${e.word}`);
    entries.forEach((e) => seen.add(e.id));
    recent = rememberBoard(recent, entries);
  }
  assert.equal(recent.length, 75);
});

test('boards: insufficient pools fail clearly and never borrow other packs', () => {
  const tiny: VocabularyBank = { version: 't', entries: bank.entries.filter((e) => e.category === 'anime' && e.tags.length === 0).slice(0, 30) };
  assert.throws(() => generateBoardWords(tiny, { size: 6, packs: ['anime'], difficulty: 'balanced' }, seededRng('x')), BoardError);
  assert.throws(() => generateBoardWords(bank, { size: 5, packs: [], difficulty: 'balanced' }, seededRng('x')), /at least one word pack/);
  // 30 words fill a 5×5 board, borrowing tiers inside the pack and saying so.
  const ok = generateBoardWords(tiny, { size: 5, packs: ['anime'], difficulty: 'expert' }, seededRng('y'));
  assertBoard(ok.entries, 25, new Set(['anime']));
  assert.ok(ok.notes.length > 0);
});

test('conflicts: word forms and containment never share a board', () => {
  const e = (word: string): VocabularyEntry => ({ id: `w_${wordKey(word)}`, word, normalized: wordKey(word), group: stem(word), category: 'general', tags: [], difficulty: 'easy', language: 'en', safety: 'safe', source: 'cipher' });
  assert.ok(conflicts(e('RUN'), e('RUNNING')));
  assert.ok(conflicts(e('CITY'), e('CITIES')));
  assert.ok(conflicts(e('SNOW'), e('SNOWMAN')));
  assert.ok(!conflicts(e('ART'), e('PARTY')), 'short words inside longer ones are fine');
  assert.ok(!conflicts(e('SNOW'), e('ICE')), 'related meanings are kept');
});
