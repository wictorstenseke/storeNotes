import type { Category } from './categories';

export type StoreDef = { id: string; name: string; baseline: Category[] };

// Example layouts. Task 15 replaces these with the two real stores.
export const STORES: StoreDef[] = [
  {
    id: 'store-a',
    name: 'Store A',
    baseline: [
      'produce', 'bakery', 'deli', 'cheese', 'meat', 'fish', 'dairy', 'eggs',
      'frozen', 'pantry', 'pasta_rice', 'canned', 'baking', 'spices_sauces',
      'breakfast', 'coffee_tea', 'beverages', 'snacks', 'household',
      'personal_care', 'baby', 'pet', 'candy', 'other',
    ],
  },
  {
    id: 'store-b',
    name: 'Store B',
    baseline: [
      'bakery', 'produce', 'dairy', 'eggs', 'cheese', 'deli', 'meat', 'fish',
      'pantry', 'pasta_rice', 'canned', 'spices_sauces', 'baking', 'breakfast',
      'coffee_tea', 'snacks', 'beverages', 'frozen', 'personal_care', 'baby',
      'household', 'pet', 'candy', 'other',
    ],
  },
];

export function getStore(id: string | null): StoreDef | undefined {
  return STORES.find((store) => store.id === id);
}
