// Mirrors yolopicker src/utils/randomUtils.js at commit 4e71f820 (randomInt, randomFloat, weightedPick only).
// Logic is unchanged; the other helpers in that file are not used by the pick engine and are left out.
const UINT32_SIZE = 2 ** 32;
const UINT53_SIZE = 2 ** 53;

/** Inclusive integer bounds must be safe integers, with max - min also safe. */
export const randomInt = (min, max) => {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max ||
      !Number.isSafeInteger(max - min)) {
    throw new RangeError('Expected ordered safe integer bounds with a safe integer difference.');
  }
  if (min === max) return min;

  const range = max - min + 1;
  const cryptoSource = typeof crypto !== 'undefined' ? crypto : undefined;
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    return min + Math.floor(Math.random() * range);
  }

  // Use 53 bits for number-generator ranges that do not fit in one uint32.
  const sampleSize = range <= UINT32_SIZE ? UINT32_SIZE : UINT53_SIZE;
  const words = new Uint32Array(range <= UINT32_SIZE ? 1 : 2);
  // Only accept a multiple of the range so every remainder has equal frequency.
  const limit = sampleSize - (sampleSize % range);
  let sample;
  do {
    cryptoSource.getRandomValues(words);
    sample = words.length === 1 ? words[0]
      : (words[0] & 0x1fffff) * UINT32_SIZE + words[1];
  } while (sample >= limit);
  return min + (sample % range);
};

/** Uniform float in [0, 1) from 53 random bits. */
export const randomFloat = () => randomInt(0, Number.MAX_SAFE_INTEGER) / UINT53_SIZE;

/**
 * Returns a value, or undefined for empty/all-zero weights. Weights must be
 * finite, nonnegative numbers with a finite sum; fractional weights are allowed.
 * `random` (a () => [0, 1) source) is injectable for tests.
 */
export const weightedPick = (items, random = randomFloat) => {
  let totalWeight = 0;
  let lastPositive;
  for (const item of items) {
    if (!Number.isFinite(item.weight) || item.weight < 0) {
      throw new RangeError('Weights must be finite, nonnegative numbers.');
    }
    totalWeight += item.weight;
    if (item.weight > 0) lastPositive = item.value;
  }
  if (!Number.isFinite(totalWeight)) {
    throw new RangeError('The sum of weights must be finite.');
  }
  if (totalWeight === 0) return undefined;

  const target = random() * totalWeight;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (target < cumulative) return item.value;
  }
  // Floating-point rounding can put the target at the total; never pick a zero weight.
  return lastPositive;
};
