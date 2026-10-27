import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomFloat, weightedPick } from '../src/random.js';

const realDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
// Make getRandomValues return the given 32-bit words in order, and count calls.
const stubCrypto = (words) => {
  const state = { calls: 0 };
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: (arr) => { arr[0] = words[state.calls++]; return arr; } },
  });
  return state;
};
const restore = () => Object.defineProperty(globalThis, 'crypto', realDescriptor);

test('randomInt rejects bad bounds', () => {
  assert.throws(() => randomInt(2, 1), RangeError);
  assert.throws(() => randomInt(0.5, 3), RangeError);
  assert.equal(randomInt(7, 7), 7);
});

test('randomInt stays in range with real crypto', () => {
  for (let i = 0; i < 2000; i++) {
    const n = randomInt(-3, 4);
    assert.ok(Number.isInteger(n) && n >= -3 && n <= 4);
  }
});

test('rejection sampling: range 3 rejects the one biased word 2^32-1', () => {
  // 2^32 % 3 = 1, so limit = 2^32 - 1. Words below it map evenly; the top word must be redrawn.
  try {
    let s = stubCrypto([0xffffffff, 7]);
    assert.equal(randomInt(0, 2), 1); // 7 % 3
    assert.equal(s.calls, 2);
    s = stubCrypto([0xfffffffe]); // limit - 1: accepted
    assert.equal(randomInt(0, 2), 0xfffffffe % 3);
    assert.equal(s.calls, 1);
  } finally { restore(); }
});

test('rejection sampling: range 6 boundary at 2^32-4', () => {
  // 2^32 % 6 = 4, so limit = 2^32 - 4: words 2^32-4 .. 2^32-1 are rejected.
  try {
    let s = stubCrypto([0xfffffffc, 0xfffffffd, 0xffffffff, 11]);
    assert.equal(randomInt(0, 5), 11 % 6);
    assert.equal(s.calls, 4);
    s = stubCrypto([0xfffffffb]);
    assert.equal(randomInt(0, 5), 0xfffffffb % 6);
    assert.equal(s.calls, 1);
  } finally { restore(); }
});

test('every remainder is equally frequent over the accepted words (exhaustive small model)', () => {
  // Same acceptance rule on a 8-bit word space: 256 % 6 = 4, limit 252, remainders 0..5 each 42 times.
  const space = 256; const range = 6; const limit = space - (space % range);
  const counts = new Array(range).fill(0);
  for (let w = 0; w < limit; w++) counts[w % range]++;
  assert.deepEqual(counts, new Array(range).fill(limit / range));
});

test('randomFloat is in [0, 1)', () => {
  for (let i = 0; i < 2000; i++) {
    const f = randomFloat();
    assert.ok(f >= 0 && f < 1);
  }
});

test('weightedPick: empty, zero, single', () => {
  assert.equal(weightedPick([]), undefined);
  assert.equal(weightedPick([{ value: 'a', weight: 0 }]), undefined);
  assert.equal(weightedPick([{ value: 'a', weight: 2 }]), 'a');
});

test('weightedPick: bad weights throw', () => {
  assert.throws(() => weightedPick([{ value: 'a', weight: -1 }]), RangeError);
  assert.throws(() => weightedPick([{ value: 'a', weight: NaN }]), RangeError);
  assert.throws(() => weightedPick([{ value: 'a', weight: Infinity }]), RangeError);
});

test('weightedPick: never picks a zero weight, even at the top edge', () => {
  const items = [{ value: 'a', weight: 1 }, { value: 'z', weight: 0 }];
  assert.equal(weightedPick(items, () => 0.9999999999999999), 'a');
});

test('weightedPick respects weights at exact boundaries (1:3)', () => {
  const items = [{ value: 'a', weight: 1 }, { value: 'b', weight: 3 }];
  assert.equal(weightedPick(items, () => 0.2499), 'a');
  assert.equal(weightedPick(items, () => 0.25), 'b');
});

test('weightedPick: observed shares follow weights (real rng, 200k draws)', () => {
  const items = [{ value: 'a', weight: 1 }, { value: 'b', weight: 3 }];
  let a = 0; const n = 200000;
  for (let i = 0; i < n; i++) if (weightedPick(items) === 'a') a++;
  assert.ok(Math.abs(a / n - 0.25) < 0.01);
});
