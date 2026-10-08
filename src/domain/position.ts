import { generateKeyBetween } from 'fractional-indexing';

// Two devices can create the same position offline. When both neighbours share
// a position there is no key between them, so return one just after both.
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) return `${before}V`;
  return generateKeyBetween(before, after);
}
