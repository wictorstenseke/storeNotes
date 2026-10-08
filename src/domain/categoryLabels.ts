import type { Category } from './categories';

// What a category is called in the app, with a few examples where the name
// alone does not say what belongs in it.
export const CATEGORY_LABELS: Record<Category, { name: string; examples?: string }> = {
  produce: { name: 'Frukt & grönt' },
  bakery: { name: 'Bröd' },
  dairy: { name: 'Mejeri' },
  cheese: { name: 'Ost' },
  eggs: { name: 'Ägg' },
  meat: { name: 'Kött', examples: 'korv, bacon, kyckling' },
  fish: { name: 'Fisk' },
  deli: { name: 'Pålägg & chark' },
  chilled_sauces: { name: 'Kylda såser', examples: 'kebabsås, bearnaise' },
  frozen: { name: 'Frys', examples: 'fisk, grönsaker, färdigrätter' },
  frozen_sweet: { name: 'Glassfrysen', examples: 'glass, frysta bär' },
  pantry: { name: 'Skafferi', examples: 'olja, nötter, bönor' },
  pasta_rice: { name: 'Pasta & ris' },
  canned: { name: 'Konserver' },
  baking: { name: 'Bakning', examples: 'mjöl, socker' },
  spices_sauces: { name: 'Kryddor & såser', examples: 'ketchup, senap' },
  breakfast: { name: 'Frukost', examples: 'flingor, müsli' },
  snacks: { name: 'Snacks' },
  candy: { name: 'Godis' },
  juice: { name: 'Kyld dryck', examples: 'juice, smoothie' },
  beverages: { name: 'Dryck', examples: 'läsk, saft, öl' },
  coffee_tea: { name: 'Kaffe & te' },
  household: { name: 'Städ & hushåll' },
  personal_care: { name: 'Hygien' },
  baby: { name: 'Barn' },
  pet: { name: 'Djur' },
  other: { name: 'Övrigt' },
};
