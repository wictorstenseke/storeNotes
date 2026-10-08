// Ids from one line to another, inclusive, in list order. Empty when either
// end is no longer in the list.
export function rangeIds(order: string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1) return [];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}
