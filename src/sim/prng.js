// Seeded pseudo-random number generator for the simulator (spec §6).
// mulberry32: tiny, fast and fully deterministic for a 32-bit seed. No Math.random anywhere.

/** Normalise a seed (number or numeric string) to an unsigned 32-bit integer. */
export function normaliseSeed(seed) {
  const n = Number(seed);
  if (!Number.isInteger(n)) throw new TypeError(`Seed must be an integer, got '${seed}'.`);
  return n >>> 0;
}

/**
 * Create a seeded PRNG.
 * @param {number|string} seed integer seed
 * @returns {{ next(): number, int(min: number, max: number): number, pick<T>(arr: readonly T[]): T, chance(p: number): boolean }}
 */
export function createPrng(seed) {
  let state = normaliseSeed(seed);

  /** Next float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  function int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}): need integers with min <= max`);
    }
    return min + Math.floor(next() * (max - min + 1));
  }

  /** One element of a non-empty array. */
  function pick(arr) {
    if (!arr || arr.length === 0) throw new RangeError('pick() needs a non-empty array');
    return arr[int(0, arr.length - 1)];
  }

  /** True with probability p. */
  function chance(p) {
    return next() < p;
  }

  return { next, int, pick, chance };
}
