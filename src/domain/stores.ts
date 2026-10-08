import type { Category } from './categories';

export type StoreDef = { id: string; name: string; baseline: Category[] };

// Willys, as Wictor described it (entrance to checkout):
//   frukt och grönt; bröd; pålägg, sedan kebabsås, bearnaise och liknande kylda
//   såser; kött och fisk; mejeri, ost precis efter, och dricka; det frysta
//   (mest fisk); ägg; majs, krossade tomater, ketchup och sånt; kryddor; pasta
//   och ris; frukost, flingor; bakgrejer som mjöl och socker, samt kaffet; hem
//   och hushåll längst in, hygien, barn, djur, övrigt; sist snacks, godis och
//   den andra frysen med glass, bär och fryst frukt.
// The app adjusts this order from the order items are checked off.
const WILLYS: Category[] = [
  'produce',
  'bakery',
  'deli',
  'chilled_sauces',
  'meat',
  'fish',
  'dairy',
  'cheese',
  'beverages',
  'frozen',
  'eggs',
  'canned',
  'spices_sauces',
  'pantry',
  'pasta_rice',
  'breakfast',
  'baking',
  'coffee_tea',
  'household',
  'personal_care',
  'baby',
  'pet',
  'other',
  'snacks',
  'candy',
  'frozen_sweet',
];

export const STORES: StoreDef[] = [
  { id: 'willys', name: 'Willys', baseline: WILLYS },
  // Starts as a copy of Willys until the differences have been described.
  { id: 'ica', name: 'ICA', baseline: [...WILLYS] },
];

export function getStore(id: string | null): StoreDef | undefined {
  return STORES.find((store) => store.id === id);
}
