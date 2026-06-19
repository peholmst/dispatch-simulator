export interface RandomStream {
  next(): number;
  integer(minInclusive: number, maxInclusive: number): number;
  pickWeighted<T>(items: T[], weight: (item: T) => number): T;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandomStream(seed: string): RandomStream {
  let state = hashSeed(seed) || 0x9e3779b9;

  function next(): number {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    integer(minInclusive, maxInclusive) {
      if (maxInclusive < minInclusive) {
        throw new Error(`Invalid random range ${minInclusive}-${maxInclusive}`);
      }
      return Math.floor(next() * (maxInclusive - minInclusive + 1)) + minInclusive;
    },
    pickWeighted(items, weight) {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list");
      }

      const totalWeight = items.reduce((total, item) => total + Math.max(weight(item), 0), 0);
      if (totalWeight <= 0) {
        return items[0]!;
      }

      let target = next() * totalWeight;
      for (const item of items) {
        target -= Math.max(weight(item), 0);
        if (target <= 0) {
          return item;
        }
      }

      return items[items.length - 1]!;
    }
  };
}
