import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBank, QUESTIONS } from '../data/questions.ts';
import { matchAnswer, matchDetail, normalize } from './match.ts';

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
  no('sci-human-bones', 'clavical'); // 2 edits on an 8-letter word: too far
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
  const bad: string[] = [];
  for (const x of QUESTIONS) {
    const own = new Set(x.answers.flatMap((a) => [a.name, ...(a.aliases ?? [])]).map((n) => normalize(n, x.ignore)));
    for (const g of names) {
      if (own.has(normalize(g, x.ignore))) continue;
      const m = matchDetail(x, g);
      if (m && !m.exact) bad.push(`${x.id}: "${g}" -> ${m.answer.name}`);
    }
  }
  assert.deepEqual(bad, []);
});
