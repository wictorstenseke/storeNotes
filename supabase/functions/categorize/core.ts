import { CATEGORIES, isCategory, type Category } from '../_shared/categories.ts';

export const MAX_TEXTS = 50;

export function textKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export type Check =
  | { ok: true; texts: string[] }
  | { ok: false; status: number; message: string };

export function checkRequest(
  body: unknown,
  email: string | null | undefined,
  allowed: string,
): Check {
  const allowList = allowed
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  if (!email || !allowList.includes(email.toLowerCase())) {
    return { ok: false, status: 403, message: 'This account cannot use categorisation' };
  }
  const texts = (body as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string')) {
    return { ok: false, status: 400, message: 'texts must be a list of strings' };
  }
  if (texts.length > MAX_TEXTS) {
    return { ok: false, status: 400, message: `At most ${MAX_TEXTS} texts per request` };
  }
  return { ok: true, texts: texts as string[] };
}

export type Deps = {
  getCached(keys: string[]): Promise<Record<string, string>>;
  putCached(rows: { text_key: string; category: Category }[]): Promise<void>;
  askModel(texts: string[]): Promise<unknown>;
};

export async function categorize(
  texts: string[],
  deps: Deps,
): Promise<Record<string, Category>> {
  const keys = [...new Set(texts.map(textKey).filter((key) => key !== ''))];
  const known = new Map<string, Category>();

  if (keys.length > 0) {
    const cached = await deps.getCached(keys);
    for (const key of keys) {
      const category = cached[key];
      if (isCategory(category)) known.set(key, category);
    }
  }

  const misses = keys.filter((key) => !known.has(key));
  if (misses.length > 0) {
    const reply = await deps.askModel(misses);
    const list = (reply as { categories?: unknown } | null)?.categories;
    const fresh: { text_key: string; category: Category }[] = [];
    // Answers are matched to texts by position, so a reply of the wrong
    // length cannot be trusted at all.
    if (Array.isArray(list) && list.length === misses.length) {
      misses.forEach((key, index) => {
        const category = list[index];
        if (isCategory(category)) {
          known.set(key, category);
          fresh.push({ text_key: key, category });
        }
      });
    }
    if (fresh.length > 0) await deps.putCached(fresh);
  }

  const result: Record<string, Category> = {};
  for (const text of texts) result[text] = known.get(textKey(text)) ?? 'other';
  return result;
}

export function buildPrompt(texts: string[]): { system: string; user: string } {
  const system = [
    'You sort shopping-list items into supermarket categories.',
    'Items may be written in Swedish or English.',
    `Allowed categories: ${CATEGORIES.join(', ')}.`,
    'Use "other" for anything that is not a grocery or household product.',
    'Reply with JSON only, in the form {"categories": ["...", "..."]}:',
    'exactly one category per item, in the same order as the items.',
  ].join('\n');
  const user = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
  return { system, user };
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
  },
  required: ['categories'],
  additionalProperties: false,
};

export function parseModelContent(content: unknown): unknown {
  if (typeof content !== 'string') return null;
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
