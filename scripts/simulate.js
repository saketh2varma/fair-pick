// Fairness simulation. Uses the real engine and real crypto randomness (no seed).
// Run: node scripts/simulate.js   Writes RESULTS.md and results.json next to package.json.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPickState, draw, applyPick, nextRound } from '../src/pickEngine.js';
import { chiSquareStat, chiSquareSurvival } from './stats.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-01-01';
const t0 = Date.now();
const mkEntries = (n, weights) => Array.from({ length: n }, (_, i) => ({
  id: `Name ${String(i + 1).padStart(2, '0')}`, label: `Name ${i + 1}`, weight: weights ? weights[i] : 1,
}));
const fmtP = (p) => (p < 1e-4 ? p.toExponential(2) : p.toFixed(4));
const timed = (fn) => { const s = Date.now(); const r = fn(); r.seconds = (Date.now() - s) / 1000; return r; };

// 1. 30 names, repeat mode, 3,000,000 draws
const sim1 = () => {
  const N = 30; const DRAWS = 3_000_000;
  const entries = mkEntries(N); const state = createPickState('repeat');
  const counts = Object.fromEntries(entries.map((e) => [e.id, 0]));
  for (let i = 0; i < DRAWS; i++) counts[draw(entries, state, TODAY)]++;
  const obs = entries.map((e) => counts[e.id]); const exp = obs.map(() => DRAWS / N);
  const chi = chiSquareStat(obs, exp); const df = N - 1;
  return { names: N, draws: DRAWS, expectedEach: DRAWS / N, counts: obs, min: Math.min(...obs), max: Math.max(...obs), chiSquare: chi, df, pValue: chiSquareSurvival(chi, df) };
};

// 2. Weights 1..5, 1,500,000 draws
const sim2 = () => {
  const W = [1, 2, 3, 4, 5]; const DRAWS = 1_500_000; const total = 15;
  const entries = mkEntries(5, W); const state = createPickState('repeat');
  const counts = Object.fromEntries(entries.map((e) => [e.id, 0]));
  for (let i = 0; i < DRAWS; i++) counts[draw(entries, state, TODAY)]++;
  const obs = entries.map((e) => counts[e.id]); const exp = W.map((w) => (DRAWS * w) / total);
  const chi = chiSquareStat(obs, exp); const df = 4;
  return { weights: W, draws: DRAWS, observed: obs, expected: exp, observedShare: obs.map((o) => o / DRAWS), expectedShare: W.map((w) => w / total), chiSquare: chi, df, pValue: chiSquareSurvival(chi, df) };
};

// 3. Round mode, 30 names, 100,000 rounds
const sim3 = () => {
  const N = 30; const ROUNDS = 100_000;
  const entries = mkEntries(N); const index = new Map(entries.map((e, i) => [e.id, i]));
  let state = createPickState('round');
  let violations = 0;
  const position = Array.from({ length: N }, () => new Array(N).fill(0)); // [name][position]
  for (let r = 0; r < ROUNDS; r++) {
    const seen = new Set(); let pos = 0;
    for (;;) {
      const w = draw(entries, state, TODAY);
      if (w === null) break;
      if (seen.has(w)) violations++;
      seen.add(w); position[index.get(w)][pos] += 1; pos += 1;
      state = applyPick(state, w);
    }
    if (seen.size !== N || pos !== N) violations++;
    state = nextRound(state);
  }
  // first-pick frequency: exactly multinomial under fairness, df = N - 1
  const first = position.map((row) => row[0]); const exp = first.map(() => ROUNDS / N);
  const chi = chiSquareStat(first, exp); const df = N - 1;
  // per-name position uniformity (each name's position is marginally uniform over N slots, df = N - 1)
  const rowP = position.map((row) => chiSquareSurvival(chiSquareStat(row, row.map(() => ROUNDS / N)), df));
  return { names: N, rounds: ROUNDS, violations, firstPickCounts: first, expectedFirstPick: ROUNDS / N, chiSquare: chi, df, pValue: chiSquareSurvival(chi, df), perNamePositionPValues: rowP, minPerNamePositionP: Math.min(...rowP) };
};

// 4. 30 names, 5 absent, 1,000,000 draws
const sim4 = () => {
  const N = 30; const DRAWS = 1_000_000;
  const entries = mkEntries(N); const absent = entries.slice(0, 5).map((e) => e.id);
  const state = { ...createPickState('repeat'), absent: { date: TODAY, ids: absent } };
  const counts = Object.fromEntries(entries.map((e) => [e.id, 0]));
  for (let i = 0; i < DRAWS; i++) counts[draw(entries, state, TODAY)]++;
  const absentDraws = absent.reduce((s, id) => s + counts[id], 0);
  const obs = entries.slice(5).map((e) => counts[e.id]); const exp = obs.map(() => DRAWS / 25);
  const chi = chiSquareStat(obs, exp); const df = 24;
  return { names: N, absent: 5, draws: DRAWS, absentDraws, presentCounts: obs, expectedEach: DRAWS / 25, chiSquare: chi, df, pValue: chiSquareSurvival(chi, df) };
};

const run = { node: process.version, date: new Date().toISOString(), seed: 'crypto.getRandomValues, no seed' };
const results = { run };
results.uniform30 = timed(sim1);
results.weighted5 = timed(sim2);
results.round30 = timed(sim3);
results.absent5of30 = timed(sim4);
run.totalSeconds = (Date.now() - t0) / 1000;
writeFileSync(join(root, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

const a = results.uniform30; const b = results.weighted5; const c = results.round30; const d = results.absent5of30;
const md = `# Results

Generated by \`node scripts/simulate.js\`. Every number below was produced by running the published code.

- Node: ${run.node}
- Date (UTC): ${run.date}
- Randomness: ${run.seed}
- Total run time: ${run.totalSeconds.toFixed(1)} s

A p-value is the chance of seeing a result at least this far from the expected counts if the draw is exactly fair. A fair draw gives p-values spread anywhere between 0 and 1; a value below about 0.001 would be a warning sign. Because the run is not seeded, a re-run gives different numbers, and any single p-value is as likely to be 0.2 as 0.8.

## 1. Uniform, repeat mode: ${a.names} names, ${a.draws.toLocaleString('en-US')} draws

- Expected per name: ${a.expectedEach.toLocaleString('en-US')}
- Observed range: ${a.min.toLocaleString('en-US')} to ${a.max.toLocaleString('en-US')}
- Chi-square: ${a.chiSquare.toFixed(2)} on ${a.df} degrees of freedom, p = ${fmtP(a.pValue)}

## 2. Weights 1x to 5x: ${b.draws.toLocaleString('en-US')} draws

| Weight | Observed | Expected | Observed share | Expected share |
|---|---|---|---|---|
${b.weights.map((w, i) => `| ${w}x | ${b.observed[i].toLocaleString('en-US')} | ${b.expected[i].toLocaleString('en-US')} | ${(b.observedShare[i] * 100).toFixed(3)}% | ${(b.expectedShare[i] * 100).toFixed(3)}% |`).join('\n')}

Chi-square: ${b.chiSquare.toFixed(2)} on ${b.df} degrees of freedom, p = ${fmtP(b.pValue)}

## 3. Round mode: ${c.names} names, ${c.rounds.toLocaleString('en-US')} rounds

- Rounds where a name was missing or repeated: ${c.violations}
- First pick of each round, expected ${c.expectedFirstPick.toFixed(1)} per name: chi-square ${c.chiSquare.toFixed(2)} on ${c.df} degrees of freedom, p = ${fmtP(c.pValue)}
- Position within the round, tested per name (${c.names} tests, 29 degrees of freedom each): smallest p = ${fmtP(c.minPerNamePositionP)}. With ${c.names} tests the smallest p is expected to be around ${(1 / (c.names + 1)).toFixed(3)}; only a value far below 0.001 would be a warning sign.

## 4. Absent names: ${d.names} names, ${d.absent} marked absent, ${d.draws.toLocaleString('en-US')} draws

- Draws that landed on an absent name: ${d.absentDraws}
- ${d.names - d.absent} present names, expected ${d.expectedEach.toLocaleString('en-US')} each: chi-square ${d.chiSquare.toFixed(2)} on ${d.df} degrees of freedom, p = ${fmtP(d.pValue)}
`;
writeFileSync(join(root, 'RESULTS.md'), md);
console.log(md);
