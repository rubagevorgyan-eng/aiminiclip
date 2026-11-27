import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES } from '../engine/modes/index.ts';
import { canTransition } from '../engine/phases.ts';
import { effectiveSettings } from '../engine/settings.ts';
import { dimensions, toCoords, toIndex } from './board.ts';
import { BOARD_SIZES, DEFAULT_SETTINGS, competitiveLayout, duetAgentTotal, guessesFor } from './config.ts';
import { normalizeRoomCode, newRoomCode } from './ids.ts';
import { seededRng, shuffle } from './random.ts';
import { cleanClueWord, cleanText, wordKey } from './text.ts';
import { inviteLink, roomFromUrl } from '../net/links.ts';

test('competitive layouts add up and stay balanced on every size', () => {
  for (const size of BOARD_SIZES) {
    const l = competitiveLayout(size);
    assert.equal(l.starting + l.second + l.civilians + l.moles, size * size);
    assert.equal(l.starting - l.second, 1);
    assert.ok(l.civilians > 0 && l.moles >= 1);
  }
  assert.deepEqual(competitiveLayout(5), { cards: 25, starting: 9, second: 8, civilians: 7, moles: 1 });
  assert.ok(duetAgentTotal() < 25);
  assert.equal(guessesFor(2), 3);
  assert.equal(guessesFor(0), null);
});

test('effective settings: Classic and Duet fixed at 5×5 standard rules; Custom uses the host’s choices', () => {
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.classic, boardSize: 9 }).size, 5);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.duet, boardSize: 8 }).size, 5);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.custom, boardSize: 10 }).size, 10);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.classic, bonusGuess: false }).rules.bonusGuess, true);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.custom, bonusGuess: false }).rules.bonusGuess, false);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.custom, customKind: 'cooperative', boardSize: 9, duetTokens: 11 }).size, 5);
  assert.equal(effectiveSettings({ ...DEFAULT_SETTINGS.custom, customKind: 'cooperative', duetTokens: 11 }).rules.tokens, 11);
  for (const m of Object.values(MODES)) assert.equal(DEFAULT_SETTINGS[m.id].timer.clueSeconds, null, 'timer defaults to unlimited');
});

test('phase transitions', () => {
  assert.ok(canTransition('lobby', 'awaiting_clue'));
  assert.ok(canTransition('guessing', 'paused'));
  assert.ok(!canTransition('lobby', 'guessing'));
  assert.ok(!canTransition('completed', 'guessing'));
});

test('board coordinates round-trip', () => {
  const d = dimensions(7);
  for (let i = 0; i < d.cards; i++) {
    const { row, col } = toCoords(i, d);
    assert.equal(toIndex(row, col, d), i);
  }
});

test('room codes', () => {
  const code = newRoomCode();
  assert.equal(normalizeRoomCode(code.toLowerCase()), code);
  assert.equal(normalizeRoomCode('ab-cd e'), 'ABCDE'); // spaces and dashes ignored
  assert.equal(normalizeRoomCode('ab-cd'), null); // too short
  assert.equal(normalizeRoomCode('ABCD0'), null); // ambiguous character
  assert.equal(roomFromUrl(inviteLink(code, 'https://x.test/games/cipher/?foo=1#a')), code);
});

test('seeded randomness is deterministic', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng('s'));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng('s'));
  assert.deepEqual(a, b);
});

test('text helpers', () => {
  assert.equal(cleanText('  a\u0000  b\n', 10), 'a b');
  assert.equal(cleanClueWord(' river '), 'RIVER');
  assert.equal(cleanClueWord('two words'), null);
  assert.equal(wordKey('Café-Noir'), 'cafenoir');
});

