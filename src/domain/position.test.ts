import { describe, expect, it } from 'vitest';
import { positionBetween } from './position';

describe('positionBetween', () => {
  it('gives the first key when there are no neighbours', () => {
    expect(positionBetween(null, null)).toBe('a0');
  });

  it('gives a key after the last item', () => {
    expect(positionBetween('a0', null) > 'a0').toBe(true);
  });

  it('gives a key between two neighbours', () => {
    const key = positionBetween('a0', 'a1');
    expect(key > 'a0' && key < 'a1').toBe(true);
  });

  it('gives a usable key when both neighbours have the same position', () => {
    const key = positionBetween('a0', 'a0');
    expect(key > 'a0' && key < 'a1').toBe(true);
    expect(positionBetween(key, null) > key).toBe(true);
    const inner = positionBetween('a0', key);
    expect(inner > 'a0' && inner < key).toBe(true);
  });
});
