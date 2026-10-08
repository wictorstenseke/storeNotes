import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './parseQuickAdd';

describe('parseQuickAdd', () => {
  it('returns one item for plain text', () => {
    expect(parseQuickAdd('Milk')).toEqual(['Milk']);
  });

  it('splits on commas and line breaks and trims', () => {
    expect(parseQuickAdd('Milk, eggs\n  Bread \r\nCoffee')).toEqual(['Milk', 'eggs', 'Bread', 'Coffee']);
  });

  it('ignores empty parts', () => {
    expect(parseQuickAdd('Milk,, ,\n\nEggs,')).toEqual(['Milk', 'Eggs']);
  });

  it('returns nothing for whitespace only', () => {
    expect(parseQuickAdd('   \n ')).toEqual([]);
  });
});
