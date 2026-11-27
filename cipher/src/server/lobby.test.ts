import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startBlockers } from '../engine/lobbyRules.ts';
import { effectiveSettings } from '../engine/settings.ts';
import { projectView } from '../engine/projection.ts';
import { seededRng } from '../shared/random.ts';
import type { ModeId } from '../shared/types.ts';
import { applyLobby } from './lobby.ts';
import { addGuest, createRoom } from './room.ts';

const rng = seededRng('t');
function setup(mode: ModeId = 'classic', n = 4) {
  const room = createRoom('ABCDE', mode, 0);
  const ids = Array.from({ length: n }, (_, i) => addGuest(room, `P${i}`, 0).player.id);
  return { room, ids, host: ids[0] };
}
const send = (r: ReturnType<typeof setup>, by: string, m: Parameters<typeof applyLobby>[2]) => applyLobby(r.room, by, m, 1, rng);

test('classic seating: one handler per team, many operatives, start unlocks', () => {
  const r = setup('classic', 5);
  const [a, b, c, d, e] = r.ids;
  assert.ok(send(r, a, { t: 'seat', role: 'handler', team: 'crimson' }).ok);
  const dup = send(r, b, { t: 'seat', role: 'handler', team: 'crimson' });
  assert.equal(dup.ok, false);
  assert.ok(send(r, b, { t: 'seat', role: 'operative', team: 'crimson' }).ok);
  assert.ok(send(r, e, { t: 'seat', role: 'operative', team: 'crimson' }).ok);
  assert.ok(send(r, c, { t: 'seat', role: 'handler', team: 'cobalt' }).ok);
  assert.ok(startBlockers(r.room.settings, r.room.players).some((x) => x.includes('operative')));
  assert.ok(send(r, d, { t: 'seat', role: 'operative', team: 'cobalt' }).ok);
  assert.deepEqual(startBlockers(r.room.settings, r.room.players), []);
  assert.equal(send(r, b, { t: 'start' }).ok, false, 'only the host starts');
  assert.deepEqual(send(r, a, { t: 'start' }), { ok: true, start: true });
});

test('host-only controls', () => {
  const r = setup();
  const [host, other] = r.ids;
  assert.equal(send(r, other, { t: 'settings', mode: 'custom' }).ok, false);
  assert.equal(send(r, other, { t: 'shuffle_teams' }).ok, false);
  assert.equal(send(r, other, { t: 'kick', player: host }).ok, false);
  assert.equal(send(r, host, { t: 'kick', player: host }).ok, false);
  assert.ok(send(r, host, { t: 'kick', player: other }).ok);
  assert.equal(r.room.players.length, 3);
  assert.ok(!r.room.sessions.some((s) => s.playerId === other));
});

test('shuffle seats everyone except spectators, with one handler per team', () => {
  const r = setup('classic', 6);
  for (const id of r.ids.slice(0, 5)) send(r, id, { t: 'seat', role: 'operative', team: 'crimson' });
  send(r, r.host, { t: 'shuffle_teams' });
  const crimson = r.room.players.filter((p) => p.team === 'crimson');
  const cobalt = r.room.players.filter((p) => p.team === 'cobalt');
  assert.equal(crimson.filter((p) => p.role === 'handler').length, 1);
  assert.equal(cobalt.filter((p) => p.role === 'handler').length, 1);
  assert.equal(r.room.players.filter((p) => p.role === 'spectator').length, 1);
});

test('settings: validation, Custom options, mode switch converts seats', () => {
  const r = setup('classic');
  const h = r.host;
  assert.equal(send(r, h, { t: 'settings', boardSize: 7 as never }).ok, true);
  assert.equal(r.room.settings.boardSize, 7, 'stored as chosen (used only in Custom)');
  assert.equal(effectiveSettings(r.room.settings).size, 5, 'Classic plays 5×5');
  assert.ok(send(r, h, { t: 'settings', mode: 'custom', boardSize: 8, moles: 3, wordPacks: ['general', 'anime'], difficulty: 'expert' }).ok);
  assert.deepEqual([r.room.settings.boardSize, r.room.settings.moles, r.room.settings.difficulty], [8, 3, 'expert']);
  assert.equal(send(r, h, { t: 'settings', wordPacks: ['nope' as never] }).ok, false);
  assert.equal(send(r, h, { t: 'settings', timer: { clueSeconds: 7, guessSeconds: null } }).ok, false);
  const tooMany = send(r, h, { t: 'settings', moles: 99 });
  assert.ok(!tooMany.ok && /Assassins must be between 1 and 5/.test(tooMany.message), 'invalid values are rejected, not clamped');
  assert.equal(r.room.settings.moles, 3);
  send(r, h, { t: 'settings', wordPacks: [] });
  assert.ok(startBlockers(r.room.settings, r.room.players).some((x) => x.includes('word pack')));

  send(r, h, { t: 'settings', mode: 'classic' });
  send(r, r.ids[1], { t: 'seat', role: 'handler', team: 'cobalt' });
  send(r, h, { t: 'settings', mode: 'duet' });
  const moved = r.room.players.find((p) => p.id === r.ids[1])!;
  assert.deepEqual([moved.side, moved.team, moved.role], ['south', null, 'operative']);
  assert.equal(effectiveSettings(r.room.settings).size, 5);
});

test('duet needs at least one player per partner; spectators-off blocks start', () => {
  const r = setup('duet', 3);
  const [a, b, c] = r.ids;
  send(r, a, { t: 'seat', role: 'operative', side: 'north' });
  assert.ok(startBlockers(r.room.settings, r.room.players).some((x) => x.includes('Partner B')));
  send(r, b, { t: 'seat', role: 'operative', side: 'south' });
  assert.deepEqual(startBlockers(r.room.settings, r.room.players), []);
  send(r, a, { t: 'settings', spectatorsAllowed: false });
  assert.ok(startBlockers(r.room.settings, r.room.players).some((x) => x.startsWith('Spectators')));
  send(r, c, { t: 'seat', role: 'operative', side: 'south' });
  assert.equal(send(r, c, { t: 'seat', role: 'spectator' }).ok, false);
  assert.deepEqual(startBlockers(r.room.settings, r.room.players), []);
});

test('lobby views stay free of session tokens', () => {
  const r = setup();
  assert.ok(!JSON.stringify(projectView(r.room, r.ids[1])).includes(r.room.sessions[0].token));
});

test('leaving hands the host role to the longest-seated player', () => {
  const r = setup('classic', 3);
  assert.ok(send(r, r.host, { t: 'leave' }).ok);
  assert.equal(r.room.players.length, 2);
  assert.equal(r.room.host.hostId, r.ids[1]);
});
