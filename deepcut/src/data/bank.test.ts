import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RARITY } from '../config/game.ts';
import { matchAnswer, normalize } from '../engine/match.ts';
import type { Question, QuestionMeta } from '../engine/types.ts';
import { loadByIds, loadIndex, loadQuestions, setBankFetcher } from './bank.ts';
import { checkBank } from './questions.ts';

const ROOT = join(import.meta.dirname, '..', '..', 'public');
const built = existsSync(join(ROOT, 'bank', 'index.json'));
setBankFetcher(async (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')));
const CATEGORIES = ['General Knowledge', 'Geography', 'Animals & Nature', 'Science & Technology', 'Movies & TV', 'History & Civilizations',
  'Food & Drink', 'Sports', 'Music', 'Everyday Objects', 'Video Games', 'Cars & Vehicles', 'Mythology & Fiction', 'Anime', 'Words & Vocabulary'];

let all: Question[] = [];
let index: QuestionMeta[] = [];

test('bank loads: every indexed question has an answer file', { skip: !built && 'bank not built' }, async () => {
  index = await loadIndex();
  all = await loadQuestions(index);
  assert.equal(all.length, index.length);
  for (const q of all) assert.equal(q.answers.length, q.n, `${q.id}: index count differs from answers`);
});

test('bank integrity: ids, categories, difficulty, rarities, aliases, sources', { skip: !built && 'bank not built' }, () => {
  assert.deepEqual(checkBank(all), []);
  const tiers = new Set(RARITY.map((t) => t.id));
  const texts = new Map<string, string>();
  for (const q of all) {
    assert.ok(CATEGORIES.includes(q.category), `${q.id}: unknown category ${q.category}`);
    assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), q.id);
    assert.ok(q.answers.length >= 6, `${q.id}: only ${q.answers.length} answers`);
    assert.ok(q.answers.every((a) => tiers.has(a.rarity)), `${q.id}: bad rarity`);
    assert.ok(q.answers.some((a) => a.rarity === 'common'), `${q.id}: no common answer`);
    assert.ok((q as Question & { source?: unknown }).source, `${q.id}: missing data source`);
    assert.ok(!/\bQ\d{2,}\b/.test(q.text) && !q.answers.some((a) => /^Q\d+$/.test(a.name)), `${q.id}: raw Wikidata id leaked`);
    const k = normalize(q.text);
    assert.ok(!texts.has(k), `${q.id}: duplicate question text with ${texts.get(k)}`);
    texts.set(k, q.id);
  }
});

test('bank: every answer and alias matches its own question (sample of 300 questions)', { skip: !built && 'bank not built' }, () => {
  for (const q of all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 300)) === 0))
    for (const a of q.answers) for (const n of [a.name, ...(a.aliases ?? [])]) assert.equal(matchAnswer(q, n)?.name, a.name, `${q.id}: "${n}"`);
});

test('past results load by id; unknown ids come back undefined', { skip: !built && 'bank not built' }, async () => {
  const [a, b] = await loadByIds([index[0].id, 'no-such-question']);
  assert.equal(a?.id, index[0].id);
  assert.equal(b, undefined);
});
