import test from 'node:test';
import assert from 'node:assert/strict';
import { chiSquareSurvival, chiSquareStat } from '../scripts/stats.js';

// Critical values from standard chi-square tables (upper-tail probability).
const TABLE = [
  [1, 3.841, 0.05], [4, 9.488, 0.05], [10, 18.307, 0.05],
  [29, 42.557, 0.05], [29, 49.588, 0.01], [24, 36.415, 0.05], [100, 124.342, 0.05],
];

test('chi-square survival matches table values', () => {
  for (const [df, x, p] of TABLE) {
    assert.ok(Math.abs(chiSquareSurvival(x, df) - p) < 5e-4, `df=${df} x=${x}`);
  }
});

test('chi-square survival edge cases', () => {
  assert.equal(chiSquareSurvival(0, 5), 1);
  assert.ok(chiSquareSurvival(1000, 5) < 1e-100);
  // df=2: survival is exp(-x/2)
  assert.ok(Math.abs(chiSquareSurvival(3, 2) - Math.exp(-1.5)) < 1e-12);
});

test('chi-square statistic', () => {
  assert.equal(chiSquareStat([10, 10], [10, 10]), 0);
  assert.equal(chiSquareStat([12, 8], [10, 10]), 0.8);
});
