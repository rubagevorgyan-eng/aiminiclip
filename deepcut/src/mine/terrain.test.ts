import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2, mulberry32, valueNoise, zoneIndexAt, worldHeight, yForDepth, MINE } from './terrain.ts';

test('zone boundaries follow the config', () => {
  assert.deepEqual([0, 99, 100, 199, 200, 299, 300, 399, 400, 549, 550, 700].map(zoneIndexAt), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('seeded randomness is deterministic and in range', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.equal(hash2(3, 9, 1), hash2(3, 9, 1));
  for (let i = 0; i < 200; i++) {
    const n = valueNoise(i * 1.7, i * 0.3, 8, 5);
    assert.ok(n >= 0 && n < 1);
  }
});

test('world covers the full depth range', () => {
  assert.equal(yForDepth(0), MINE.sky);
  assert.ok(worldHeight() > yForDepth(700));
});
