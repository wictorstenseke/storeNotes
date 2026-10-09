import { describe, expect, it } from 'vitest';
import { sectionStoreId } from './sectionStore';

const section = (store_sort: boolean) => ({ id: 's1', store_sort });

describe('sectionStoreId', () => {
  it('uses the choice made on this device', () => {
    expect(sectionStoreId(section(false), { s1: 'willys' }, null)).toBe('willys');
  });

  it('treats an empty choice as no store, even if the list used to sort by store', () => {
    expect(sectionStoreId(section(true), { s1: '' }, 'ica')).toBeNull();
  });

  it('follows the old flag and store for a list with no choice yet', () => {
    expect(sectionStoreId(section(true), {}, 'ica')).toBe('ica');
    expect(sectionStoreId(section(false), {}, 'ica')).toBeNull();
    expect(sectionStoreId(section(true), {}, null)).toBeNull();
  });
});
