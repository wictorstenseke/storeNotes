export const CATEGORIES = [
  'produce',
  'bakery',
  'dairy',
  'cheese',
  'eggs',
  'meat',
  'fish',
  'deli',
  'chilled_sauces',
  'frozen',
  'frozen_sweet',
  'pantry',
  'pasta_rice',
  'canned',
  'baking',
  'spices_sauces',
  'breakfast',
  'snacks',
  'candy',
  'juice',
  'beverages',
  'coffee_tea',
  'household',
  'personal_care',
  'baby',
  'pet',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
