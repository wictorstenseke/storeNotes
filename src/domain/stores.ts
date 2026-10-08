import type { Category } from './categories';

export type StoreDef = { id: string; name: string; baseline: Category[] };

// Willys, as Wictor described it (entrance to checkout):
//   frukt och grönt; bröd; pålägg, sedan kebabsås, bearnaise och liknande kylda
//   såser; kött och fisk; mejeri; kyld dryck (juicen, frukostdrycken); det frysta
//   (mest fisk); ost; ägg; majs, krossade tomater, ketchup och sånt; kryddor; pasta
//   och ris; frukost, flingor; bakgrejer som mjöl och socker, samt kaffet; hem
//   och hushåll längst in, hygien, barn, djur, övrigt; läsk, saft, öl och cider
//   i närheten av snacksen; sist snacks, godis och
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
  'juice',
  'frozen',
  'cheese',
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
  'beverages',
  'snacks',
  'candy',
  'frozen_sweet',
];

// ICA, as Wictor described it:
//   frukt och grönt; korv, bacon osv, kött och fisk; charken, pålägg; ost;
//   pasta och ris; ketchup osv; sen bröd; kaffe; frysavdelning för fryst kött
//   och grönt; mejeri och kylda drycker; efter mejeriet hygien och städgrejer,
//   djur nära där; godis och glassfrys; sist drycken och snacks.
// He did not mention the lines marked "guess"; they sit where they most
// plausibly are and move as the app learns.
const ICA: Category[] = [
  'produce',
  'meat',
  'fish',
  'deli',
  'chilled_sauces', // guess: with the cold cuts, as at Willys
  'cheese',
  'pasta_rice',
  'pantry', // guess: dry goods by the pasta
  'canned', // guess: by the ketchup
  'spices_sauces',
  'bakery',
  'breakfast', // guess: by the bread
  'baking', // guess: by the coffee
  'coffee_tea',
  'frozen',
  'dairy',
  'eggs', // guess: by the dairy
  'juice',
  'personal_care',
  'baby', // guess: by hygiene
  'household',
  'pet',
  'other', // guess
  'candy',
  'frozen_sweet',
  'beverages',
  'snacks',
];

export const STORES: StoreDef[] = [
  { id: 'willys', name: 'Willys', baseline: WILLYS },
  { id: 'ica', name: 'ICA', baseline: ICA },
];

export function getStore(id: string | null): StoreDef | undefined {
  return STORES.find((store) => store.id === id);
}
