import { describe, expect, it } from 'vitest';
import { CATEGORIES, isCategory } from './categories';
import { STORES, getStore } from './stores';

describe('categories', () => {
  it('has 24 unique categories', () => {
    expect(CATEGORIES).toHaveLength(24);
    expect(new Set(CATEGORIES).size).toBe(24);
  });

  it('recognises only listed categories', () => {
    expect(isCategory('dairy')).toBe(true);
    expect(isCategory('Dairy')).toBe(false);
    expect(isCategory(3)).toBe(false);
  });
});

describe('stores', () => {
  it('defines two stores with unique ids', () => {
    expect(STORES).toHaveLength(2);
    expect(new Set(STORES.map((s) => s.id)).size).toBe(2);
  });

  it('lists every category exactly once in each baseline', () => {
    for (const store of STORES) {
      expect([...store.baseline].sort()).toEqual([...CATEGORIES].sort());
    }
  });

  it('finds a store by id', () => {
    expect(getStore(STORES[0].id)).toBe(STORES[0]);
    expect(getStore('nope')).toBeUndefined();
    expect(getStore(null)).toBeUndefined();
  });
});
