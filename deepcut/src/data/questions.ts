import { RARITY } from '../config/game.ts';
import { normalize } from '../engine/match.ts';
import type { Question } from '../engine/types.ts';
import animals from './questions/animals.json' with { type: 'json' };
import anime from './questions/anime.json' with { type: 'json' };
import cars from './questions/cars.json' with { type: 'json' };
import generalKnowledge from './questions/general-knowledge.json' with { type: 'json' };
import geography from './questions/geography.json' with { type: 'json' };
import history from './questions/history.json' with { type: 'json' };
import movies from './questions/movies.json' with { type: 'json' };
import science from './questions/science.json' with { type: 'json' };
import sports from './questions/sports.json' with { type: 'json' };
import videoGames from './questions/video-games.json' with { type: 'json' };

/**
 * Question bank. Each JSON file is an array of Question objects (see engine/types.ts).
 * To add questions, edit a file; to add a category, add a JSON file and one import above.
 */
const FILES = [geography, history, science, animals, movies, anime, videoGames, sports, cars, generalKnowledge];
export const QUESTIONS: Question[] = (FILES as unknown as Question[][]).flat();

/** Returns a list of data problems; empty means the bank is valid. */
export function checkBank(qs: Question[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const tiers = new Set(RARITY.map((t) => t.id));
  for (const q of qs) {
    if (!q.id || ids.has(q.id)) errs.push(`duplicate or missing id: ${q.id}`);
    ids.add(q.id);
    if (!q.text || !q.category) errs.push(`${q.id}: missing text or category`);
    if (q.answers.length < 2) errs.push(`${q.id}: needs multiple answers`);
    const owner = new Map<string, string>();
    for (const a of q.answers) {
      if (!tiers.has(a.rarity)) errs.push(`${q.id}: ${a.name} has unknown rarity ${a.rarity}`);
      for (const n of [a.name, ...(a.aliases ?? [])]) {
        const k = normalize(n, q.ignore);
        const prev = owner.get(k);
        if (prev && prev !== a.name) errs.push(`${q.id}: "${n}" matches both ${prev} and ${a.name}`);
        owner.set(k, a.name);
      }
    }
    for (const r of q.reject ?? []) {
      const k = normalize(r, q.ignore);
      if (owner.has(k)) errs.push(`${q.id}: reject "${r}" is also an accepted answer (${owner.get(k)})`);
    }
  }
  return errs;
}

if (import.meta.env?.DEV) {
  const errs = checkBank(QUESTIONS);
  if (errs.length) console.error('Question bank problems:\n' + errs.join('\n'));
}

