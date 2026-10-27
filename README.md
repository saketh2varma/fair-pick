# fair-pick

The picking engine behind the Wheel of Names at [yolopicker.com/wheel-of-names](https://yolopicker.com/wheel-of-names), which teachers use to call on students. This repository holds the exact picking code, its tests, and a simulation anyone can re-run. MIT licence, no dependencies, Node 18 or newer.

The files in `src/` mirror `src/utils/wheel/pickEngine.js` and `src/utils/randomUtils.js` of the Yolo Picker site at commit `4e71f820`. The only edit is the import path. `random.js` keeps only the three helpers the engine uses (`randomInt`, `randomFloat`, `weightedPick`).

## Modes

- **repeat**: every eligible name can win on every spin. Chance is proportional to its weight (1x to 5x on the site).
- **round** (everyone once): a name that has been picked this round is not eligible until the round is reset. Draws are uniform over the names still waiting; weights are ignored.
- **remove**: a picked name is taken off the wheel until restored. Weights apply among the names that remain.

In every mode, names marked absent are not eligible. Absent marks expire the next day. Undo reverses one pick.

## How the random number is made

`randomFloat` returns a number in [0, 1) from 53 random bits supplied by `crypto.getRandomValues`. Those bits come from `randomInt`, which uses rejection sampling: it throws away any 32-bit (or 53-bit) sample at or above the largest multiple of the range, so every remainder is equally likely and there is no modulo bias. `weightedPick` multiplies the float by the total weight and walks the cumulative weights. `Math.random` is not used for picks: its quality is not specified and it is not meant for fair selection.

One caveat in the mirrored code: `randomInt` falls back to `Math.random` if the runtime has no `crypto.getRandomValues`. Every current browser and Node 18+ has it, so the fallback is not reached in practice.

## How the spin relates to the draw

The winner is drawn first, then the wheel is animated to stop on that slice. In the site code, `launchSpin` in `src/components/wheel/WheelOfNames.js` calls `draw(...)` from `pickEngine.js`, finds the winner's slice index, and computes the stopping angle with `calculateWeightedAbsoluteTarget` in `src/utils/wheel/wheelUtils.js`. The only randomness there is how many extra full turns the wheel makes (`randomInt(0, 2)` added to a minimum); it does not move the landing slice. `spin` in `src/components/wheel/WheelCanvas.js` then animates to that fixed target, and the result it reports is the winner chosen before the spin (`onSpinEnd(targetWinnerIndex, ...)`). Stop! ends the running spin on the same winner and never draws again. The animation does not influence who wins. This repository covers the draw only; the animation code is not included.

## Run it

```
node --test                  # unit tests
node scripts/simulate.js     # simulation, writes RESULTS.md and results.json (about 15 seconds)
```

The simulation uses the real engine and `crypto.getRandomValues` with no seed, so each run gives different numbers. The chi-square p-value code is in `scripts/stats.js` and is checked against published table values in `test/stats.test.js`.

## Results

From the run made for publication (`node scripts/simulate.js`, Node v26.4.0, 2026-10-27), reported as it came out. Full detail in [RESULTS.md](RESULTS.md). Development runs before it gave p-values for the first test between 0.005 and 0.64, which is the normal spread for a fair draw: re-run it and you will get different numbers.

| Test | Draws | Result | p-value |
|---|---|---|---|
| 30 names, repeat mode | 3,000,000 | each name 99,244 to 100,682 (expected 100,000) | 0.1774 |
| Weights 1x to 5x | 1,500,000 | shares within 0.05 percentage points of expected | 0.6034 |
| Round mode, 30 names | 100,000 rounds | 0 rounds with a missing or repeated name; first pick uniform | 0.6515 |
| 30 names, 5 absent | 1,000,000 | 0 draws on absent names; 25 present names uniform | 0.6750 |

A p-value near 0 would signal bias; a fair draw gives values anywhere between 0 and 1. A statistical test can show a result is consistent with fair; it cannot prove the code is correct, which is why the source is here to read.

## What fair means here

On every spin, each eligible name has exactly its weight's share of the chance (equal shares when no weights are set). Earlier spins do not change later chances. The exceptions are round and remove modes, by design: there, names already picked are not eligible, so the remaining names share the chance equally (round) or by weight (remove).

## Licence

MIT, see [LICENSE](LICENSE).
