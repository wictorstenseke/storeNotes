import { describe, expect, it } from 'vitest';
import { rangeIds, toggleId } from './selection';

const ORDER = ['a', 'b', 'c', 'd'];

describe('rangeIds', () => {
  it('returns the ids from one line to another, inclusive, in list order', () => {
    expect(rangeIds(ORDER, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('works when the range is made upwards', () => {
    expect(rangeIds(ORDER, 'c', 'a')).toEqual(['a', 'b', 'c']);
  });

  it('returns the single line when both ends are the same', () => {
    expect(rangeIds(ORDER, 'b', 'b')).toEqual(['b']);
  });

  it('returns nothing when an end is no longer in the list', () => {
    expect(rangeIds(ORDER, 'b', 'gone')).toEqual([]);
    expect(rangeIds(ORDER, 'gone', 'b')).toEqual([]);
  });
});

describe('toggleId', () => {
  it('adds an id that is not selected and removes one that is', () => {
    expect(toggleId(['a'], 'c')).toEqual(['a', 'c']);
    expect(toggleId(['a', 'c'], 'a')).toEqual(['c']);
  });
});
