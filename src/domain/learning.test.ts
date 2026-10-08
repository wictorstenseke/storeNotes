import { describe, expect, it } from 'vitest';
import type { Category } from './categories';
import { applyTrip, baselineScores, effectiveOrder, learnFromDone, tripRanks } from './learning';
import type { StoreDef } from './stores';
import { makeItem } from '../test/factories';

const BASE: Category[] = ['produce', 'dairy', 'frozen', 'candy', 'other'];
const STORE: StoreDef = { id: 's1', name: 'S1', baseline: BASE };
const OTHER_STORE: StoreDef = { id: 's2', name: 'S2', baseline: BASE };

const at = (second: number) => `2026-10-08T10:00:${String(second).padStart(2, '0')}.000Z`;
const done = (id: string, category: Category | null, second: number, store: string | null = 's1') =>
  makeItem({ id, category, checked: true, checked_at: at(second), checked_store: store });

describe('baselineScores', () => {
  it('scales position to 0–1', () => {
    expect(baselineScores(BASE)).toEqual({ produce: 0, dairy: 0.25, frozen: 0.5, candy: 0.75, other: 1 });
  });
});

describe('tripRanks', () => {
  it('gives the mean check-off index per category, scaled to 0–1', () => {
    const ranks = tripRanks([
      done('ice', 'frozen', 4),
      done('apple', 'produce', 1),
      done('milk', 'dairy', 3),
      done('pear', 'produce', 2),
    ]);
    expect(ranks).not.toBeNull();
    expect(ranks!.produce).toBeCloseTo(1 / 6);
    expect(ranks!.dairy).toBeCloseTo(2 / 3);
    expect(ranks!.frozen).toBeCloseTo(1);
  });

  it('returns null with fewer than three distinct categories', () => {
    expect(tripRanks([done('a', 'produce', 1), done('b', 'produce', 2), done('c', 'dairy', 3)])).toBeNull();
  });

  it('ignores items with no category', () => {
    expect(
      tripRanks([done('a', 'produce', 1), done('b', 'dairy', 2), done('c', null, 3), done('d', null, 4)]),
    ).toBeNull();
  });
});

describe('applyTrip', () => {
  it('moves each score 30% toward the trip rank and leaves others alone', () => {
    const next = applyTrip({ produce: 0, dairy: 0.5, frozen: 1 }, { produce: 1, dairy: 0.5 });
    expect(next.produce).toBeCloseTo(0.3);
    expect(next.dairy).toBeCloseTo(0.5);
    expect(next.frozen).toBe(1);
  });
});

describe('effectiveOrder', () => {
  it('is the baseline when there are no scores', () => {
    expect(effectiveOrder(BASE)).toEqual(BASE);
    expect(effectiveOrder(BASE, null)).toEqual(BASE);
  });

  it('sorts by score and fills missing scores from the baseline', () => {
    expect(effectiveOrder(BASE, { produce: 0.6 })).toEqual(['dairy', 'frozen', 'produce', 'candy', 'other']);
  });

  it('breaks ties by baseline order', () => {
    expect(effectiveOrder(BASE, { frozen: 0.25 })).toEqual(['produce', 'dairy', 'frozen', 'candy', 'other']);
  });
});

describe('learnFromDone', () => {
  it('returns new scores for a store with a usable trip', () => {
    const learned = learnFromDone(
      [done('ice', 'frozen', 1), done('milk', 'dairy', 2), done('apple', 'produce', 3)],
      [STORE],
      {},
    );
    expect(Object.keys(learned)).toEqual(['s1']);
    expect(learned.s1.frozen).toBeCloseTo(0.7 * 0.5 + 0.3 * 0);
    expect(learned.s1.produce).toBeCloseTo(0.7 * 0 + 0.3 * 1);
    expect(learned.s1.candy).toBe(0.75);
  });

  it('starts from the current scores when there are some', () => {
    const learned = learnFromDone(
      [done('ice', 'frozen', 1), done('milk', 'dairy', 2), done('apple', 'produce', 3)],
      [STORE],
      { s1: { produce: 1 } },
    );
    expect(learned.s1.produce).toBeCloseTo(1);
  });

  it('handles each store separately', () => {
    const learned = learnFromDone(
      [
        done('a', 'frozen', 1, 's1'), done('b', 'dairy', 2, 's1'), done('c', 'produce', 3, 's1'),
        done('d', 'produce', 4, 's2'), done('e', 'dairy', 5, 's2'),
      ],
      [STORE, OTHER_STORE],
      {},
    );
    expect(Object.keys(learned)).toEqual(['s1']);
  });

  it('learns nothing from items with no store, an unknown store, or no category', () => {
    const learned = learnFromDone(
      [
        done('a', 'frozen', 1, null), done('b', 'dairy', 2, null), done('c', 'produce', 3, null),
        done('d', 'frozen', 4, 'closed'), done('e', 'dairy', 5, 'closed'), done('f', 'produce', 6, 'closed'),
        done('g', null, 7, 's1'), done('h', null, 8, 's1'), done('i', null, 9, 's1'),
      ],
      [STORE],
      {},
    );
    expect(learned).toEqual({});
  });
});
