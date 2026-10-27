// Mirrors yolopicker src/utils/wheel/pickEngine.js and src/utils/randomUtils.js at commit 4e71f820
// Only change: the import path ('../randomUtils' -> './random.js'). Logic is unchanged.
// Pure pick logic for the wheel (PRD §5). No React, no DOM. Randomness is crypto via
// randomUtils; `rng` is injectable ( () => [0, 1) ) so tests are deterministic.
import { randomFloat, weightedPick } from './random.js';

export const PICK_MODES = ['repeat', 'round', 'remove'];

export const EMPTY_MESSAGES = {
  'no-entries': 'Add some names',
  'all-absent': 'Everyone is marked absent',
  'round-complete': 'Everyone here has had a turn',
  'all-picked': 'Everyone has been picked',
};

export const createPickState = (mode = 'repeat') => ({
  mode, round: 1, picked: [], removed: [], absent: null, last: null,
});

/** Local calendar date as YYYY-MM-DD. */
export const localDate = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Absent marks expire the next day. */
export const absentToday = (state, today) => (
  state.absent && state.absent.date === today ? state.absent.ids : []
);

export const eligible = (entries, state, today) => {
  const absent = new Set(absentToday(state, today));
  let out = entries.filter((e) => !absent.has(e.id));
  if (state.mode === 'remove') {
    const gone = new Set(state.removed);
    out = out.filter((e) => !gone.has(e.id));
  } else if (state.mode === 'round') {
    const done = new Set(state.picked);
    out = out.filter((e) => !done.has(e.id));
  }
  return out;
};

/** Why a draw is impossible, or null when it is possible. */
export const emptyReason = (entries, state, today) => {
  if (entries.length === 0) return 'no-entries';
  const absent = new Set(absentToday(state, today));
  if (entries.every((e) => absent.has(e.id))) return 'all-absent';
  if (eligible(entries, state, today).length > 0) return null;
  return state.mode === 'round' ? 'round-complete' : 'all-picked';
};

/** Winner id, or null when nothing is eligible. Round mode ignores weights. */
export const draw = (entries, state, today, rng = randomFloat) => {
  const pool = eligible(entries, state, today);
  if (pool.length === 0) return null;
  if (state.mode === 'round') return pool[Math.floor(rng() * pool.length)].id;
  const id = weightedPick(pool.map((e) => ({ value: e.id, weight: e.weight ?? 1 })), rng);
  return id === undefined ? null : id;
};

/** Pass `tally` so undoLast can restore the winner's previous tally entry. */
export const applyPick = (state, winnerId, tally) => {
  const last = { picked: [...state.picked], removed: [...state.removed], winnerId };
  if (tally) last.tallyPrev = tally[winnerId] || null;
  const next = { ...state, last };
  if (state.mode === 'round') next.picked = [...state.picked, winnerId];
  if (state.mode === 'remove') next.removed = [...state.removed, winnerId];
  return next;
};

export const applyTally = (tally, winnerId, today) => ({
  ...tally,
  [winnerId]: { count: (tally[winnerId]?.count || 0) + 1, last: today },
});

/** One level only. Returns { state, tally }. */
export const undoLast = (state, tally) => {
  const { last } = state;
  if (!last) return { state, tally };
  const nextTally = { ...tally };
  if ('tallyPrev' in last) {
    if (last.tallyPrev) nextTally[last.winnerId] = last.tallyPrev;
    else delete nextTally[last.winnerId];
  }
  return {
    state: { ...state, picked: last.picked, removed: last.removed, last: null },
    tally: nextTally,
  };
};

export const status = (entries, state, today) => {
  const absent = new Set(absentToday(state, today));
  const present = entries.filter((e) => !absent.has(e.id)).length;
  const left = eligible(entries, state, today).length;
  const ids = new Set(entries.map((e) => e.id));
  return {
    present,
    pickedThisRound: state.picked.filter((id) => ids.has(id) && !absent.has(id)).length,
    left,
    complete: state.mode === 'round' && present > 0 && left === 0,
  };
};

export const nextRound = (state) => ({ ...state, round: state.round + 1, picked: [], last: null });

export const restoreAll = (state) => ({ ...state, removed: [], last: null });

/** Drop ids that no longer exist. Call after every entry edit. */
export const reconcile = (state, entries) => {
  const ids = new Set(entries.map((e) => e.id));
  const keep = (list) => list.filter((id) => ids.has(id));
  return {
    ...state,
    picked: keep(state.picked),
    removed: keep(state.removed),
    absent: state.absent ? { ...state.absent, ids: keep(state.absent.ids) } : null,
    last: state.last && ids.has(state.last.winnerId) ? state.last : null,
  };
};

/** Safe PickState from untrusted stored data (session, class, backup). */
export const normalizePick = (raw, fallbackMode = 'repeat') => {
  const base = createPickState(PICK_MODES.includes(raw?.mode) ? raw.mode : fallbackMode);
  if (!raw || typeof raw !== 'object') return base;
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
  const absent = raw.absent && /^\d{4}-\d{2}-\d{2}$/.test(raw.absent.date) ? { date: raw.absent.date, ids: ids(raw.absent.ids) } : null;
  return {
    ...base,
    round: Number.isInteger(raw.round) && raw.round > 0 ? raw.round : 1,
    picked: ids(raw.picked),
    removed: ids(raw.removed),
    absent,
  };
};

/** Same state in another mode. The lists are kept, so switching back loses nothing. */
export const setMode = (state, mode) => ({ ...state, mode, last: null });

/** Mark or unmark one entry absent today. A mark from an earlier day is replaced, not extended. */
export const toggleAbsent = (state, id, today) => {
  const ids = absentToday(state, today);
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  return { ...state, absent: next.length ? { date: today, ids: next } : null };
};
