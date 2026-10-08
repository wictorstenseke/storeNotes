import type { Category } from './categories';
import type { Item } from './types';

export type Hold = { id: string; index: number };

export function byManual<T extends { position: string; id: string }>(a: T, b: T): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortOpen(items: Item[], order: Category[] | null, hold: Hold | null = null): Item[] {
  const open = items.filter(
    (i) => !i.checked && !i.deleted_at && (i.text !== '' || i.id === hold?.id),
  );

  let sorted: Item[];
  if (!order) {
    sorted = [...open].sort(byManual);
  } else {
    const rank = (i: Item): number => {
      if (i.category === null) return -1;
      const at = order.indexOf(i.category);
      return at === -1 ? order.length : at;
    };
    sorted = [...open].sort((a, b) => rank(a) - rank(b) || byManual(a, b));
  }

  if (!hold) return sorted;
  const held = sorted.find((i) => i.id === hold.id);
  if (!held) return sorted;
  const rest = sorted.filter((i) => i.id !== hold.id);
  const at = Math.max(0, Math.min(hold.index, rest.length));
  return [...rest.slice(0, at), held, ...rest.slice(at)];
}

export function sortDone(items: Item[]): Item[] {
  const time = (i: Item) => (i.checked_at ? Date.parse(i.checked_at) : 0);
  return items
    .filter((i) => i.checked && !i.deleted_at)
    .sort((a, b) => time(b) - time(a) || (a.id < b.id ? -1 : 1));
}
