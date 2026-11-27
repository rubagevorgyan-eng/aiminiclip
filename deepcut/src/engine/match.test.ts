import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBank, QUESTIONS } from '../data/questions.ts';
import { matchAnswer, matchDetail, normalize, setKnownNames } from './match.ts';
import type { Question } from './types.ts';

const q = (id: string) => {
  const found = QUESTIONS.find((x) => x.id === id);
  assert.ok(found, `missing question ${id}`);
  return found;
};
const ok = (id: string, guess: string, expected: string) =>
  assert.equal(matchAnswer(q(id), guess)?.name, expected, `${id}: "${guess}" should be ${expected}`);
const no = (id: string, guess: string) =>
  assert.equal(matchAnswer(q(id), guess), null, `${id}: "${guess}" should be rejected`);

test('question bank: 50 valid questions, 5 per category, no ambiguous aliases', () => {
  assert.deepEqual(checkBank(QUESTIONS), []);
  assert.equal(QUESTIONS.length, 50);
  const per = new Map<string, number>();
  for (const x of QUESTIONS) per.set(x.category, (per.get(x.category) ?? 0) + 1);
  assert.deepEqual([...per.values()], Array(10).fill(5));
  for (const x of QUESTIONS) assert.ok(x.answers.length >= 6, `${x.id} has only ${x.answers.length} answers`);
});

test('every canonical name and alias matches its own answer', () => {
  for (const x of QUESTIONS)
    for (const a of x.answers)
      for (const n of [a.name, ...(a.aliases ?? [])])
        assert.equal(matchAnswer(x, n)?.name, a.name, `${x.id}: "${n}"`);
});

test('normalize: case, whitespace, punctuation, accents, roman numerals, abbreviations', () => {
  assert.equal(normalize('  Mr. Mime '), 'mr mime');
  assert.equal(normalize('Pokémon'), 'pokemon');
  assert.equal(normalize("FARFETCH'D"), 'farfetchd');
  assert.equal(normalize('The Great Pyramid'), 'great pyramid');
  assert.equal(normalize('Grand Theft Auto V'), 'grand theft auto 5');
  assert.equal(normalize('St. Lucia'), 'saint lucia');
  assert.equal(normalize('Deadpool & Wolverine'), 'deadpool and wolverine');
});

test('accepts formatting variants, aliases and abbreviations', () => {
  ok('geo-largest-countries', 'U.S.A.', 'United States');
  ok('geo-largest-countries', 'united states of america', 'United States');
  ok('geo-countries-s', 'St Lucia', 'Saint Lucia');
  ok('geo-countries-s', 'sao tome and principe', 'São Tomé and Príncipe');
  ok('geo-europe-capitals', 'Reykjavik', 'Reykjavík');
  ok('geo-europe-capitals', 'KIEV', 'Kyiv');
  ok('his-20th-century-presidents', 'FDR', 'Franklin D. Roosevelt');
  ok('his-20th-century-presidents', 'john f kennedy', 'John F. Kennedy');
  ok('vg-gen1-pokemon', 'mr mime', 'Mr. Mime');
  ok('vg-gen1-pokemon', 'Farfetchd', "Farfetch'd");
  ok('vg-gta-games', 'GTA 5', 'Grand Theft Auto V');
  ok('vg-gta-games', 'gta san andreas', 'Grand Theft Auto: San Andreas');
  ok('vg-gta-games', 'Grand Theft Auto III', 'Grand Theft Auto III');
  ok('vg-zelda-games', 'The Legend of Zelda: Breath of the Wild', 'Breath of the Wild');
  ok('vg-zelda-games', 'zelda ocarina of time', 'Ocarina of Time');
  ok('vg-home-consoles', 'ps4', 'PlayStation 4');
  ok('vg-home-consoles', 'Mega Drive', 'Sega Genesis');
  ok('gk-harry-potter-books', "Harry Potter and the Sorcerer's Stone", "Harry Potter and the Philosopher's Stone");
  ok('gk-harry-potter-books', 'goblet of fire', 'Harry Potter and the Goblet of Fire');
  ok('ani-penguins', 'Emperor Penguin', 'Emperor');
  ok('ani-penguins', 'adelie penguins', 'Adélie');
  ok('mov-mcu-films', 'Spiderman: No Way Home', 'Spider-Man: No Way Home');
  ok('mov-mcu-films', 'endgame', 'Avengers: Endgame');
  ok('mov-pixar', 'wall-e', 'WALL-E');
  ok('mov-pixar', 'monsters inc', 'Monsters, Inc.');
  ok('spo-nba-teams', 'sixers', 'Philadelphia 76ers');
  ok('spo-nfl-teams', 'Niners', 'San Francisco 49ers');
  ok('car-f1-champions', 'raikkonen', 'Kimi Räikkönen');
  ok('ani-straw-hats', 'monkey d luffy', 'Monkey D. Luffy');
  ok('sci-one-letter-elements', 'W', 'Tungsten');
  ok('ani-marsupials', 'kangaroos', 'Kangaroo');
});

test('accepts small typos on longer answers', () => {
  ok('geo-largest-countries', 'Austrailia', 'Australia');
  ok('geo-largest-countries', 'Kazakstan', 'Kazakhstan');
  ok('his-ancient-wonders', 'Mausoleum of Halicarnasus', 'Mausoleum at Halicarnassus');
  ok('vg-gen1-pokemon', 'Charizzard', 'Charizard');
  ok('vg-gen1-pokemon', 'Bulbasuar', 'Bulbasaur');
  ok('ani-penguins', 'humbolt', 'Humboldt');
  ok('car-f1-champions', 'Schumacer', 'Michael Schumacher');
  ok('sci-human-bones', 'clavicel', 'Clavicle');
  ok('sci-human-bones', 'clavical', 'Clavicle'); // 2 edits on an 8-letter word
  ok('geo-europe-capitals', 'Copenhagan', 'Copenhagen');
  assert.equal(matchDetail(q('geo-largest-countries'), 'Austrailia')?.exact, false);
  assert.equal(matchDetail(q('geo-largest-countries'), 'Australia')?.exact, true);
});

test('rejects wrong answers, including near-misses', () => {
  no('geo-largest-countries', 'Austria'); // 2 edits from Australia
  no('geo-largest-countries', 'Greenland');
  no('ani-wild-cats', 'Liger'); // 1 edit from Tiger, different first letter
  no('ani-wild-cats', 'Black panther');
  no('mov-pixar', 'Inside Out 3'); // numbers must match
  no('mov-pixar', 'Toy Story 5');
  no('mov-pixar', 'Shrek');
  no('vg-gta-games', 'GTA VI');
  no('vg-gta-games', 'Grand Theft Auto 6');
  no('vg-gta-games', 'GTA'); // series name, not a specific game
  no('vg-zelda-games', 'Zelda');
  no('his-roman-emperors', 'Julius Caesar');
  no('his-20th-century-presidents', 'Roosevelt'); // ambiguous: two qualify
  no('his-20th-century-presidents', 'George W. Bush');
  no('his-henry-viii-wives', 'Catherine'); // three Catherines
  no('car-f1-champions', 'Hill'); // three champions named Hill
  no('car-f1-champions', 'Leclerc');
  no('sci-noble-gases', 'Nitrogen');
  no('sci-planets-dwarf-planets', 'Moon');
  no('sci-planets-dwarf-planets', 'Mar'); // too short for typo tolerance
  no('vg-gen1-pokemon', 'Togepi');
  no('vg-gen1-pokemon', 'Pikachuuu'); // 2 edits on a 9-letter word
  no('spo-world-cup-winners', 'Netherlands');
  no('spo-paris-2024-sports', 'Baseball');
  no('geo-countries-s', 'Scotland');
  no('ani-hokage', 'Danzo');
  no('mov-mcu-films', 'Iron Man 4');
  no('gk-rainbow-colors', 'Pink');
  no('geo-borders-china', '');
  no('geo-borders-china', '!!!');
});

test('no known name from another question is accepted as a typo', () => {
  const names = new Set<string>();
  for (const x of QUESTIONS) for (const a of x.answers) for (const n of [a.name, ...(a.aliases ?? [])]) names.add(n);
  for (const x of QUESTIONS) for (const r of x.reject ?? []) names.add(r);
  setKnownNames([...names].map((n) => normalize(n).replace(/ /g, ''))); // as the game does from bank/names.json
  const bad: string[] = [];
  for (const x of QUESTIONS) {
    const own = new Set(x.answers.flatMap((a) => [a.name, ...(a.aliases ?? [])]).map((n) => normalize(n, x.ignore)));
    for (const g of names) {
      if (own.has(normalize(g, x.ignore))) continue;
      const m = matchDetail(x, g);
      if (m && !m.exact) bad.push(`${x.id}: "${g}" -> ${m.answer.name}`);
    }
  }
  setKnownNames([]);
  assert.deepEqual(bad, []);
});

test('suggestAnswer offers "did you mean" for near misses, never for accepted or far-off guesses', async () => {
  const { suggestAnswer } = await import('./match.ts');
  const s = (id: string, g: string) => suggestAnswer(q(id), g)?.name ?? null;
  assert.equal(s('vg-gen1-pokemon', 'Bulbasor'), null, 'auto-corrected instead');
  assert.equal(s('geo-largest-countries', 'Austria'), 'Australia');
  assert.equal(s('mov-pixar', 'ratatoui'), 'Ratatouille'); // prefix
  assert.equal(s('mov-mcu-films', 'thorr'), null, 'a one-letter slip is auto-corrected, not suggested');
  ok('mov-mcu-films', 'thorr', 'Thor');
  assert.equal(s('vg-gen1-pokemon', 'Charizard'), null, 'already accepted: no suggestion');
  assert.equal(s('vg-gen1-pokemon', 'Banana'), null);
  assert.equal(s('his-roman-emperors', 'Julius Caesar'), null, 'known wrong answers are never suggested');
  assert.equal(s('mov-pixar', 'Toy Story 5'), null, 'numbers must match');
  assert.equal(s('his-20th-century-presidents', 'Rosevelt'), null, 'ambiguous: two Roosevelts');
  assert.equal(s('sci-noble-gases', 'Neo'), null, 'too short');
});


// Focused validation tests on a small synthetic question (independent of bank data).
const mk = (answers: [string, string[]?][], extra: Partial<Question> = {}): Question => ({
  id: 't', text: 'T', category: 'Geography', difficulty: 'easy', family: 't', n: answers.length,
  answers: answers.map(([name, aliases], i) => ({ name, aliases, rarity: i % 2 ? 'rare' : 'common' })), ...extra,
});
const C = mk([['Thailand'], ['Australia'], ['Iraq'], ["Côte d'Ivoire", ['Ivory Coast']], ['United States', ['USA', 'US']], ['Netherlands', ['Holland']],
  ['Saint Lucia'], ['Philippines'], ['Butterfly'], ['Mario'], ['Maria']], { reject: ['Austria'] });
const m = (g: string) => matchDetail(C, g);
const is = (g: string, name: string, exact: boolean) => assert.deepEqual([m(g)?.answer.name, m(g)?.exact], [name, exact], `"${g}"`);
const not = (g: string) => assert.equal(m(g), null, `"${g}" should be rejected`);

test('validation order: exact, normalized and alias matches are exact', () => {
  is('Thailand', 'Thailand', true);
  is('  thAILand  ', 'Thailand', true);
  is('cote divoire', "Côte d'Ivoire", true);
  is('Ivory   Coast', "Côte d'Ivoire", true);
  is('US', 'United States', true); // 2-letter alias: explicit aliases always count
  is('St. Lucia', 'Saint Lucia', true);
  is('the Netherlands', 'Netherlands', true);
  is('butterflies', 'Butterfly', true);
  is('United-States', 'United States', true);
  assert.equal(m('Holland')?.answer, m('Netherlands')?.answer, 'aliases share one canonical answer (same rarity)');
});

test('typos: transposed, missing, extra and wrong letters are auto-corrected', () => {
  is('Thialand', 'Thailand', false); // transposition
  is('Austrlia', 'Australia', false); // missing letter
  is('Australiaa', 'Australia', false); // extra letter
  is('Thailond', 'Thailand', false); // wrong letter
  is('Phillipines', 'Philippines', false); // 2 edits on 11 letters
  is('Hailand', 'Thailand', false); // first-letter slip: only as the single edit on 8+ letters
  is('Unted States', 'United States', false); // inside a multiword answer
  is('Irak', 'Iraq', false); // 4 letters: 1 edit
});

test('false positives: short words, ambiguity, known names and rejects are never corrected', () => {
  not('Ira'); // 1-3 letters: exact or alias only
  not('Irq');
  not('Marie'); // 1 edit from both Mario and Maria
  not('Austria'); // listed as a wrong answer
  not('Thiland and'); // too far
  not('Butterfy fish');
  setKnownNames(['iran', 'austral']);
  not('Iran'); // a real, different country
  is('Irak', 'Iraq', false); // still a typo: not a known name
  setKnownNames([]);
  is('Iran', 'Iraq', false); // without the guard the 1-edit rule would accept it, hence the guard
});
