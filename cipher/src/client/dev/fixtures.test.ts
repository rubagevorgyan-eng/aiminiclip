import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD_SIZES } from '../../shared/config.ts';
import { buildFixture, type FixturePhase } from './fixtures.ts';

const LIVE: FixturePhase[] = ['awaiting_clue', 'guessing', 'paused'];

test('fixture operative and spectator views never hold a key or unrevealed identities', () => {
  for (const size of BOARD_SIZES) {
    for (const phase of LIVE) {
      for (const perspective of ['operative', 'spectator'] as const) {
        const view = buildFixture({ mode: 'custom', size, perspective, phase });
        assert.equal(view.key, null);
        assert.equal(view.match?.declassified, null);
        const json = JSON.stringify(view);
        assert.ok(!json.includes('dev-fixture-seed') && !json.includes('"identities"') && !json.includes('"token"'));
      }
    }
  }
});

test('fixture boards are consistent for every size and mode', () => {
  for (const size of BOARD_SIZES) {
    const v = buildFixture({ mode: 'custom', size, perspective: 'handler', phase: 'guessing' });
    assert.equal(v.match?.cards.length, size * size);
    assert.equal(new Set(v.match?.cards.map((c) => c.word)).size, size * size);
    assert.equal(v.key?.kind, 'competitive');
  }
  const duet = buildFixture({ mode: 'duet', size: 5, perspective: 'south', phase: 'guessing' });
  assert.equal(duet.key?.kind === 'cooperative' && duet.key.side, 'south');
});
