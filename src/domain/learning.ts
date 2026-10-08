import type { Category } from './categories';
import type { StoreDef } from './stores';
import type { Item } from './types';

export type Scores = Record<string, number>;

const MIN_TRIP_CATEGORIES = 3;
const KEEP = 0.7;

export function baselineScores(baseline: Category[]): Scores {
  const last = baseline.length - 1;
  return Object.fromEntries(baseline.map((c, i) => [c, last > 0 ? i / last : 0]));
}

export function tripRanks(done: Item[]): Scores | null {
  const trip = done
    .filter((i) => i.category !== null && i.checked_at !== null)
    .sort(
      (a, b) =>
        Date.parse(a.checked_at!) - Date.parse(b.checked_at!) || (a.id < b.id ? -1 : 1),
    );

  const totals = new Map<string, { sum: number; count: number }>();
  const last = trip.length - 1;
  trip.forEach((item, index) => {
    const total = totals.get(item.category!) ?? { sum: 0, count: 0 };
    total.sum += last > 0 ? index / last : 0;
    total.count += 1;
    totals.set(item.category!, total);
  });

  if (totals.size < MIN_TRIP_CATEGORIES) return null;
  return Object.fromEntries([...totals].map(([c, t]) => [c, t.sum / t.count]));
}

export function applyTrip(scores: Scores, ranks: Scores): Scores {
  const next = { ...scores };
  for (const [category, rank] of Object.entries(ranks)) {
    next[category] = KEEP * (scores[category] ?? rank) + (1 - KEEP) * rank;
  }
  return next;
}

export function effectiveOrder(baseline: Category[], scores?: Scores | null): Category[] {
  const all = { ...baselineScores(baseline), ...(scores ?? {}) };
  return [...baseline].sort(
    (a, b) => all[a] - all[b] || baseline.indexOf(a) - baseline.indexOf(b),
  );
}

export function learnFromDone(
  done: Item[],
  stores: StoreDef[],
  current: Record<string, Scores | undefined>,
): Record<string, Scores> {
  const learned: Record<string, Scores> = {};
  for (const store of stores) {
    const ranks = tripRanks(done.filter((i) => i.checked_store === store.id));
    if (!ranks) continue;
    learned[store.id] = applyTrip(
      { ...baselineScores(store.baseline), ...(current[store.id] ?? {}) },
      ranks,
    );
  }
  return learned;
}
