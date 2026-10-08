import { describe, expect, it } from 'vitest';
import { CATEGORIES, isCategory } from './categories';
import { STORES, getStore } from './stores';

describe('categories', () => {
  it('has 28 unique categories', () => {
    expect(CATEGORIES).toHaveLength(28);
    expect(new Set(CATEGORIES).size).toBe(28);
  });

  it('keeps biscuits apart from snacks', () => {
    // Willys has a biscuit and cookie section by the chilled drinks.
    expect(isCategory('biscuits')).toBe(true);
  });

  it('keeps chilled sauces and the second freezer apart from their look-alikes', () => {
    // Willys keeps kebab sauce by the cold cuts, not with spices and ketchup,
    // and ice cream and frozen berries at the far end, not with frozen food.
    expect(isCategory('chilled_sauces')).toBe(true);
    expect(isCategory('frozen_sweet')).toBe(true);
    // Chilled juice is by the dairy; soft drinks, beer and cider are by the snacks.
    expect(isCategory('juice')).toBe(true);
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

  it('is Willys and ICA', () => {
    expect(STORES.map((store) => [store.id, store.name])).toEqual([
      ['willys', 'Willys'],
      ['ica', 'ICA'],
    ]);
  });

  it('walks Willys in the order Wictor described', () => {
    const order = STORES[0].baseline;
    const before = (a: string, b: string) => order.indexOf(a as never) < order.indexOf(b as never);
    expect(order[0]).toBe('produce');
    expect(order.slice(1, 4)).toEqual(['bakery', 'deli', 'chilled_sauces']);
    expect(order.slice(order.indexOf('fish'), order.indexOf('fish') + 8)).toEqual([
      'fish', 'dairy', 'juice', 'biscuits', 'frozen', 'cheese', 'eggs', 'canned',
    ]);
    expect(before('fish', 'dairy')).toBe(true);
    expect(before('frozen', 'eggs')).toBe(true);
    expect(before('canned', 'spices_sauces')).toBe(true);
    expect(before('spices_sauces', 'pasta_rice')).toBe(true);
    expect(before('baking', 'coffee_tea')).toBe(true);
    expect(before('coffee_tea', 'household')).toBe(true);
    expect(order.slice(-5)).toEqual(['other', 'beverages', 'snacks', 'candy', 'frozen_sweet']);
  });

  it('walks ICA in the order Wictor described', () => {
    const order = STORES[1].baseline;
    // Only what he said outright; the categories he did not mention are placed by guess.
    const described = [
      'produce', 'meat', 'fish', 'deli', 'cheese', 'pasta_rice', 'spices_sauces', 'bakery',
      'coffee_tea', 'frozen', 'dairy', 'juice', 'personal_care', 'household', 'candy',
      'frozen_sweet', 'beverages', 'snacks',
    ];
    expect(order.filter((category) => described.includes(category))).toEqual(described);
    expect(order[0]).toBe('produce');
    expect(order.slice(-2)).toEqual(['beverages', 'snacks']);
    expect(Math.abs(order.indexOf('pet') - order.indexOf('household'))).toBe(1);
    // Corrections he gave after seeing the first version.
    expect(order.slice(0, 2)).toEqual(['produce', 'baby']);
    expect(order.indexOf('deli') - order.indexOf('chilled_sauces')).toBe(1);
    expect(order.indexOf('baking') - order.indexOf('spices_sauces')).toBe(1);
    expect(order.indexOf('biscuits') - order.indexOf('bakery')).toBe(1);
    expect(order).not.toEqual(STORES[0].baseline);
  });

  it('finds a store by id', () => {
    expect(getStore(STORES[0].id)).toBe(STORES[0]);
    expect(getStore('nope')).toBeUndefined();
    expect(getStore(null)).toBeUndefined();
  });
});
