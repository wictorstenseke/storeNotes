import type { Item, Section } from '../domain/types';

export function makeItem(p: Partial<Item> & { id: string }): Item {
  return {
    list_id: 'list-1',
    section_id: 'sec-1',
    text: p.id,
    position: 'a0',
    checked: false,
    checked_at: null,
    checked_store: null,
    category: null,
    updated_at: '2026-10-08T10:00:00.000Z',
    deleted_at: null,
    ...p,
  };
}

export function makeSection(p: Partial<Section> & { id: string }): Section {
  return {
    list_id: 'list-1',
    title: p.id,
    position: 'a0',
    store_sort: false,
    updated_at: '2026-10-08T10:00:00.000Z',
    deleted_at: null,
    ...p,
  };
}
