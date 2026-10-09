import { describe, expect, it } from 'vitest';
import { listAsText } from './shareText';
import type { Item, Section } from './types';

const section = (id: string, title: string, position: string): Section => ({
  id,
  list_id: 'l',
  title,
  position,
  store_sort: false,
  updated_at: '',
  deleted_at: null,
});

const item = (id: string, section_id: string, text: string, position: string, checked = false): Item => ({
  id,
  list_id: 'l',
  section_id,
  text,
  position,
  checked,
  checked_at: null,
  checked_store: null,
  category: null,
  updated_at: '',
  deleted_at: null,
});

describe('listAsText', () => {
  it('lists open items per list, in order, and skips done ones', () => {
    const text = listAsText(
      [section('b', 'Presenter', 'b'), section('a', 'Handlingslista', 'a')],
      [
        item('1', 'a', 'Mjölk', 'b'),
        item('2', 'a', 'Bröd', 'a'),
        item('3', 'a', 'Ost', 'c', true),
        item('4', 'b', 'Bok', 'a'),
      ],
    );
    expect(text).toBe('Handlingslista\n- Bröd\n- Mjölk\n\nPresenter\n- Bok');
  });

  it('names an untitled list', () => {
    expect(listAsText([section('a', '', 'a')], [])).toBe('Namnlös');
  });
});
