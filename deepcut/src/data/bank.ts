import type { Question, QuestionMeta } from '../engine/types.ts';

/**
 * Runtime question bank. `bank/index.json` lists every question (no answers); each question's
 * answers live in `bank/q/<id>.json` and are fetched only when a dig uses it. Paths are relative so
 * the game works at any URL. Tests swap the fetcher for a file reader.
 */
type Fetcher = (path: string) => Promise<unknown>;
let fetcher: Fetcher = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
export const setBankFetcher = (f: Fetcher) => void (fetcher = f);

let indexPromise: Promise<QuestionMeta[]> | null = null;
export function loadIndex(): Promise<QuestionMeta[]> {
  indexPromise ??= (fetcher('bank/index.json') as Promise<{ questions: QuestionMeta[] }>).then((d) => d.questions);
  indexPromise.catch(() => (indexPromise = null)); // allow a retry after a network error
  return indexPromise;
}

const cache = new Map<string, Promise<Question>>();
export function loadQuestion(meta: QuestionMeta): Promise<Question> {
  let p = cache.get(meta.id);
  if (!p) {
    p = (fetcher(`bank/q/${meta.id}.json`) as Promise<Omit<Question, keyof QuestionMeta>>).then((body) => ({ ...meta, ...body }) as Question);
    p.catch(() => cache.delete(meta.id));
    cache.set(meta.id, p);
  }
  return p;
}

export const loadQuestions = (metas: QuestionMeta[]) => Promise.all(metas.map(loadQuestion));

/** Load stored question ids (e.g. a past Daily Dig); ids no longer in the bank come back undefined. */
export async function loadByIds(ids: string[]): Promise<(Question | undefined)[]> {
  const index = await loadIndex();
  const byId = new Map(index.map((m) => [m.id, m]));
  return Promise.all(ids.map((id) => (byId.has(id) ? loadQuestion(byId.get(id)!) : Promise.resolve(undefined))));
}
