import type { Category } from './categories';

export type Section = {
  id: string;
  list_id: string;
  title: string;
  position: string;
  store_sort: boolean;
  updated_at: string;
  deleted_at: string | null;
};

export type Item = {
  id: string;
  list_id: string;
  section_id: string;
  text: string;
  position: string;
  checked: boolean;
  checked_at: string | null;
  checked_store: string | null;
  category: Category | null;
  updated_at: string;
  deleted_at: string | null;
};

export type StoreOrder = {
  list_id: string;
  store_id: string;
  scores: Record<string, number>;
  updated_at: string;
};
