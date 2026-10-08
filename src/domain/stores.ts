import type { Category } from './categories';

export type StoreDef = { id: string; name: string; baseline: Category[] };

// The category orders below are still examples. They are replaced with the
// real walking order once the layout of each store has been described.
export const STORES: StoreDef[] = [
  {
    id: 'willys',
    name: 'Willys',
    baseline: [
      'produce', 'bakery', 'deli', 'cheese', 'meat', 'fish', 'dairy', 'eggs',
      'frozen', 'pantry', 'pasta_rice', 'canned', 'baking', 'spices_sauces',
      'breakfast', 'coffee_tea', 'beverages', 'snacks', 'household',
      'personal_care', 'baby', 'pet', 'candy', 'other',
    ],
  },
  {
    id: 'ica',
    name: 'ICA',
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
