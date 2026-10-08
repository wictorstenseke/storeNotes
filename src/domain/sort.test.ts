import { describe, expect, it } from 'vitest';
import type { Category } from './categories';
import { sortDone, sortOpen } from './sort';
import { makeItem } from '../test/factories';

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const ORDER: Category[] = ['produce', 'dairy', 'frozen'];

describe('sortOpen, manual order', () => {
  it('orders by position', () => {
    const items = [
      makeItem({ id: 'c', position: 'a2' }),
      makeItem({ id: 'a', position: 'a0' }),
      makeItem({ id: 'b', position: 'a1' }),
    ];
    expect(ids(sortOpen(items, null))).toEqual(['a', 'b', 'c']);
  });

  it('orders items with the same position by id', () => {
    const items = [makeItem({ id: 'z', position: 'a0' }), makeItem({ id: 'm', position: 'a0' })];
    expect(ids(sortOpen(items, null))).toEqual(['m', 'z']);
  });

  it('leaves out checked and deleted items', () => {
    const items = [
      makeItem({ id: 'a' }),
      makeItem({ id: 'b', checked: true, checked_at: '2026-10-08T10:00:00.000Z' }),
      makeItem({ id: 'c', deleted_at: '2026-10-08T10:00:00.000Z' }),
    ];
    expect(ids(sortOpen(items, null))).toEqual(['a']);
  });

  it('hides empty lines unless they are held', () => {
    const items = [makeItem({ id: 'a', position: 'a0' }), makeItem({ id: 'b', position: 'a1', text: '' })];
    expect(ids(sortOpen(items, null))).toEqual(['a']);
    expect(ids(sortOpen(items, null, { id: 'b', index: 1 }))).toEqual(['a', 'b']);
  });
});

describe('sortOpen, store order', () => {
  it('puts untagged first, then category rank, then position', () => {
    const items = [
      makeItem({ id: 'ice', position: 'a0', category: 'frozen' }),
      makeItem({ id: 'milk', position: 'a1', category: 'dairy' }),
      makeItem({ id: 'new', position: 'a2', category: null }),
      makeItem({ id: 'apple', position: 'a3', category: 'produce' }),
      makeItem({ id: 'yoghurt', position: 'a4', category: 'dairy' }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['new', 'apple', 'milk', 'yoghurt', 'ice']);
  });

  it('puts categories missing from the order last', () => {
    const items = [
      makeItem({ id: 'soap', position: 'a0', category: 'household' }),
      makeItem({ id: 'ice', position: 'a1', category: 'frozen' }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['ice', 'soap']);
  });

  it('keeps the held item at its index even when sorting would move it', () => {
    const items = [
      makeItem({ id: 'apple', position: 'a0', category: 'produce' }),
      makeItem({ id: 'milk', position: 'a1', category: 'dairy' }),
      makeItem({ id: 'typing', position: 'a2', category: null }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['typing', 'apple', 'milk']);
    expect(ids(sortOpen(items, ORDER, { id: 'typing', index: 2 }))).toEqual(['apple', 'milk', 'typing']);
  });

  it('clamps a held index that is past the end', () => {
    const items = [makeItem({ id: 'a', position: 'a0' }), makeItem({ id: 'b', position: 'a1' })];
    expect(ids(sortOpen(items, null, { id: 'a', index: 9 }))).toEqual(['b', 'a']);
  });

  it('ignores a hold for an item that is not in the list', () => {
    const items = [makeItem({ id: 'a' })];
    expect(ids(sortOpen(items, null, { id: 'gone', index: 0 }))).toEqual(['a']);
  });
});

describe('sortDone', () => {
  it('returns checked items, most recently checked first', () => {
    const items = [
      makeItem({ id: 'open' }),
      makeItem({ id: 'first', checked: true, checked_at: '2026-10-08T10:00:01.000Z' }),
      makeItem({ id: 'last', checked: true, checked_at: '2026-10-08T10:00:03.000Z' }),
      makeItem({ id: 'gone', checked: true, checked_at: '2026-10-08T10:00:04.000Z', deleted_at: 'x' }),
    ];
    expect(ids(sortDone(items))).toEqual(['last', 'first']);
  });

  it('compares timestamps written in different formats', () => {
    const items = [
      makeItem({ id: 'client', checked: true, checked_at: '2026-10-08T10:00:02.000Z' }),
      makeItem({ id: 'server', checked: true, checked_at: '2026-10-08T10:00:05+00:00' }),
    ];
    expect(ids(sortDone(items))).toEqual(['server', 'client']);
  });
});
