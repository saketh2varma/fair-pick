import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPickState, absentToday, eligible, draw, emptyReason, applyPick, applyTally,
  undoLast, status, nextRound, restoreAll, reconcile, localDate, EMPTY_MESSAGES, normalizePick, setMode, toggleAbsent,
} from '../src/pickEngine.js';

const eq = assert.deepEqual;
const ids = (list) => list.map((e) => e.id);
const mk = (...labels) => labels.map((l) => ({ id: l, label: l, weight: 1 }));
const DAY1 = '2026-11-02';
const DAY2 = '2026-11-03';
const at = (i, n) => () => (i + 0.5) / n; // rng that lands on index i of n equal slots
const base = () => ({ ...createPickState('round'), absent: { date: DAY1, ids: ['B'] } });

describe('everyone once with an absent student', () => {
  const entries = mk('A', 'B', 'C', 'D', 'E');

  test('eligible, draw, status', () => {
    let s = base();
    eq(ids(eligible(entries, s, DAY1)), ['A', 'C', 'D', 'E']);
    const winner = draw(entries, s, DAY1, () => 0.25); // index 1 of 4
    assert.equal(winner, 'C');
    s = applyPick(s, winner);
    eq(s.picked, ['C']);
    eq(status(entries, s, DAY1), { present: 4, pickedThisRound: 1, left: 3, complete: false });
  });

  test('round completes, empty reason, next round', () => {
    let s = applyPick(base(), 'C');
    for (const id of ['A', 'E', 'D']) s = applyPick(s, id);
    eq(s.picked, ['C', 'A', 'E', 'D']);
    assert.equal(status(entries, s, DAY1).complete, true);
    assert.equal(draw(entries, s, DAY1, () => 0), null);
    assert.equal(emptyReason(entries, s, DAY1), 'round-complete');
    assert.equal(EMPTY_MESSAGES['round-complete'], 'Everyone here has had a turn');
    const n = nextRound(s);
    assert.equal(n.round, 2);
    eq(n.picked, []);
  });

  test('absent marks expire next day', () => {
    const s = base();
    eq(absentToday(s, DAY1), ['B']);
    eq(absentToday(s, DAY2), []);
    assert.ok(ids(eligible(entries, s, DAY2)).includes('B'));
  });

  test('added entry is eligible mid-round', () => {
    const s = applyPick(base(), 'C');
    const more = mk('A', 'B', 'C', 'D', 'E', 'F');
    eq(ids(eligible(more, s, DAY1)), ['A', 'D', 'E', 'F']);
    assert.equal(status(more, s, DAY1).left, 4);
  });

  test('reconcile drops deleted ids', () => {
    let s = applyPick(base(), 'C');
    s = reconcile(s, mk('A', 'B', 'D', 'E'));
    eq(s.picked, []);
    assert.equal(s.last, null);
  });
});

test('round mode ignores weights', () => {
  const entries = [{ id: 'A', weight: 3 }, { id: 'B', weight: 1 }];
  const s = createPickState('round');
  assert.equal(draw(entries, s, DAY1, () => 0.49), 'A');
  assert.equal(draw(entries, s, DAY1, () => 0.5), 'B');
  assert.equal(draw(entries, s, DAY1, () => 0.74), 'B');
});

test('remove mode pick, tally and undo', () => {
  const entries = mk('A', 'B', 'C');
  let s = createPickState('remove');
  let tally = {};
  const w = draw(entries, s, DAY1, at(1, 3));
  assert.equal(w, 'B');
  s = applyPick(s, w, tally);
  tally = applyTally(tally, w, DAY1);
  eq(s.removed, ['B']);
  eq(tally.B, { count: 1, last: DAY1 });
  const u = undoLast(s, tally);
  eq(u.state.removed, []);
  assert.equal(u.tally.B, undefined);
  assert.equal(u.state.last, null);
});

test('undo restores a previous tally entry', () => {
  let tally = { B: { count: 2, last: '2026-10-30' } };
  const s = applyPick(createPickState('repeat'), 'B', tally);
  tally = applyTally(tally, 'B', DAY1);
  eq(undoLast(s, tally).tally.B, { count: 2, last: '2026-10-30' });
});

describe('repeat mode weights 3/1/1', () => {
  const entries = [{ id: 'A', weight: 3 }, { id: 'B', weight: 1 }, { id: 'C', weight: 1 }];
  const s = createPickState('repeat');
  const pick = (r) => draw(entries, s, DAY1, () => r);
  test('boundaries at 0.6 and 0.8', () => {
    assert.equal(pick(0), 'A');
    assert.equal(pick(0.5999999), 'A');
    assert.equal(pick(0.6), 'B');
    assert.equal(pick(0.7999999), 'B');
    assert.equal(pick(0.8), 'C');
    assert.equal(pick(0.9999999), 'C');
  });
  test('repeat never changes lists', () => {
    const next = applyPick(s, 'A');
    eq(next.picked, []);
    eq(next.removed, []);
    eq(ids(eligible(entries, next, DAY1)), ['A', 'B', 'C']);
  });
});

test('duplicate labels are separate entries', () => {
  const entries = [{ id: 'x1', label: 'Alex', weight: 1 }, { id: 'x2', label: 'Alex', weight: 1 }];
  const s = applyPick(createPickState('round'), 'x1');
  eq(ids(eligible(entries, s, DAY1)), ['x2']);
});

describe('empty reasons and helpers', () => {
  test('no entries / all absent / remove exhausted', () => {
    assert.equal(emptyReason([], createPickState(), DAY1), 'no-entries');
    const abs = { ...createPickState('round'), absent: { date: DAY1, ids: ['A', 'B'] } };
    assert.equal(emptyReason(mk('A', 'B'), abs, DAY1), 'all-absent');
    assert.equal(status(mk('A', 'B'), abs, DAY1).complete, false);
    const gone = { ...createPickState('remove'), removed: ['A', 'B'] };
    assert.equal(emptyReason(mk('A', 'B'), gone, DAY1), 'all-picked');
    eq(restoreAll(gone).removed, []);
    assert.equal(emptyReason(mk('A', 'B'), createPickState(), DAY1), null);
  });
  test('localDate formats local calendar date', () => {
    assert.equal(localDate(new Date(2026, 10, 2, 23, 59)), '2026-11-02');
  });
  test('default rng is crypto and lands in the pool', () => {
    const entries = mk('A', 'B', 'C');
    for (let i = 0; i < 20; i++) assert.ok(['A', 'B', 'C'].includes(draw(entries, createPickState(), DAY1)));
  });
});

describe('normalizePick / setMode', () => {
  test('keeps a valid state, drops junk', () => {
    const raw = { mode: 'round', round: 2, picked: ['A', 3], removed: 'x', absent: { date: DAY1, ids: ['B', null] }, last: { evil: true } };
    eq(normalizePick(raw), { mode: 'round', round: 2, picked: ['A'], removed: [], absent: { date: DAY1, ids: ['B'] }, last: null });
  });
  test('falls back on bad input', () => {
    eq(normalizePick(null, 'round'), createPickState('round'));
    assert.equal(normalizePick({ mode: 'nope', round: -1, absent: { date: 'x' } }).mode, 'repeat');
  });
  test('setMode keeps the lists so switching back loses nothing', () => {
    const s = setMode(applyPick(createPickState('round'), 'A'), 'repeat');
    assert.equal(s.mode, 'repeat');
    eq(s.picked, ['A']);
    assert.equal(s.last, null);
  });
});

test('toggleAbsent marks, unmarks, and drops a stale day', () => {
  let s = toggleAbsent(createPickState('round'), 'B', DAY1);
  eq(s.absent, { date: DAY1, ids: ['B'] });
  s = toggleAbsent(s, 'C', DAY1);
  eq(s.absent.ids, ['B', 'C']);
  eq(toggleAbsent(s, 'B', DAY2).absent, { date: DAY2, ids: ['B'] });
  assert.equal(toggleAbsent(toggleAbsent(createPickState(), 'B', DAY1), 'B', DAY1).absent, null);
});

describe('properties with the real rng', () => {
  const names = Array.from({ length: 12 }, (_, i) => `N${i}`);
  const entries = names.map((id) => ({ id, label: id, weight: 1 }));

  test('weighted draws respect weights', () => {
    const e = [{ id: 'a', weight: 1 }, { id: 'b', weight: 4 }];
    const s = createPickState('repeat');
    let b = 0; const n = 100000;
    for (let i = 0; i < n; i++) if (draw(e, s, DAY1) === 'b') b++;
    assert.ok(Math.abs(b / n - 0.8) < 0.01);
  });

  test('round mode: each present name gets exactly one turn per round', () => {
    let s = { ...createPickState('round'), absent: { date: DAY1, ids: ['N3', 'N7'] } };
    for (let round = 0; round < 200; round++) {
      const seen = [];
      for (;;) {
        const w = draw(entries, s, DAY1);
        if (w === null) break;
        seen.push(w);
        s = applyPick(s, w);
      }
      assert.equal(seen.length, 10);
      assert.equal(new Set(seen).size, 10);
      assert.ok(!seen.includes('N3') && !seen.includes('N7'));
      assert.equal(emptyReason(entries, s, DAY1), 'round-complete');
      s = nextRound(s);
    }
  });

  test('absent names are never drawn in repeat mode', () => {
    const s = { ...createPickState('repeat'), absent: { date: DAY1, ids: ['N0', 'N1', 'N2'] } };
    for (let i = 0; i < 20000; i++) {
      assert.ok(!['N0', 'N1', 'N2'].includes(draw(entries, s, DAY1)));
    }
  });

  test('remove mode never repeats and ends empty', () => {
    let s = createPickState('remove');
    const seen = new Set();
    for (let i = 0; i < names.length; i++) {
      const w = draw(entries, s, DAY1);
      assert.ok(!seen.has(w));
      seen.add(w);
      s = applyPick(s, w);
    }
    assert.equal(seen.size, names.length);
    assert.equal(draw(entries, s, DAY1), null);
    assert.equal(emptyReason(entries, s, DAY1), 'all-picked');
  });
});
