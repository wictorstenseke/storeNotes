import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from '../_shared/categories.ts';
import {
  buildPrompt,
  categorize,
  checkRequest,
  parseModelContent,
  textKey,
  type Deps,
} from './core.ts';

function makeDeps(cache: Record<string, string> = {}, overrides: Partial<Deps> = {}) {
  const deps = {
    getCached: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in cache).map((k) => [k, cache[k]])),
    ),
    putCached: vi.fn(async (rows: { text_key: string; category: string }[]) => {
      for (const row of rows) cache[row.text_key] = row.category;
    }),
    askModel: vi.fn(async (texts: string[]): Promise<unknown> => ({
      categories: texts.map(() => 'dairy'),
    })),
    ...overrides,
  };
  return deps;
}

describe('textKey', () => {
  it('lower-cases, trims and collapses whitespace', () => {
    expect(textKey('  Mjölk   3% ')).toBe('mjölk 3%');
  });
});

describe('checkRequest', () => {
  const allowed = 'anna@example.com, Bo@Example.com';

  it('accepts an allowed email whatever its case', () => {
    expect(checkRequest({ texts: ['Milk'] }, 'BO@example.com', allowed)).toEqual({ ok: true, texts: ['Milk'] });
  });

  it('refuses an email that is not allowed, or missing', () => {
    expect(checkRequest({ texts: [] }, 'cy@example.com', allowed)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ texts: [] }, null, allowed)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ texts: [] }, 'anna@example.com', '')).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a body without a list of strings', () => {
    expect(checkRequest(null, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
    expect(checkRequest({ texts: 'Milk' }, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
    expect(checkRequest({ texts: ['Milk', 3] }, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
  });

  it('accepts 50 texts and refuses 51', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `item ${i}`);
    expect(checkRequest({ texts: fifty }, 'anna@example.com', allowed)).toMatchObject({ ok: true });
    expect(checkRequest({ texts: [...fifty, 'one more'] }, 'anna@example.com', allowed)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('categorize', () => {
  it('answers from the cache without asking the model', async () => {
    const deps = makeDeps({ milk: 'dairy' });
    expect(await categorize(['Milk'], deps)).toEqual({ Milk: 'dairy' });
    expect(deps.askModel).not.toHaveBeenCalled();
    expect(deps.putCached).not.toHaveBeenCalled();
  });

  it('asks the model only for texts not in the cache and caches the answers', async () => {
    const deps = makeDeps(
      { milk: 'dairy' },
      { askModel: vi.fn(async () => ({ categories: ['produce'] })) },
    );
    expect(await categorize(['Milk', 'Äpple'], deps)).toEqual({ Milk: 'dairy', Äpple: 'produce' });
    expect(deps.askModel).toHaveBeenCalledWith(['äpple']);
    expect(deps.putCached).toHaveBeenCalledWith([{ text_key: 'äpple', category: 'produce' }]);
  });

  it('asks once for texts that differ only in case or spacing', async () => {
    const deps = makeDeps();
    expect(await categorize(['milk', 'MILK ', 'Milk'], deps)).toEqual({
      milk: 'dairy',
      'MILK ': 'dairy',
      Milk: 'dairy',
    });
    expect(deps.askModel).toHaveBeenCalledWith(['milk']);
  });

  it('uses other for an unknown category and does not cache it', async () => {
    const deps = makeDeps({}, { askModel: vi.fn(async () => ({ categories: ['dairy', 'sweets'] })) });
    expect(await categorize(['Milk', 'Godis'], deps)).toEqual({ Milk: 'dairy', Godis: 'other' });
    expect(deps.putCached).toHaveBeenCalledWith([{ text_key: 'milk', category: 'dairy' }]);
  });

  it('uses other for everything when the reply has the wrong length', async () => {
    const deps = makeDeps({}, { askModel: vi.fn(async () => ({ categories: ['dairy'] })) });
    expect(await categorize(['Milk', 'Eggs'], deps)).toEqual({ Milk: 'other', Eggs: 'other' });
    expect(deps.putCached).not.toHaveBeenCalled();
  });

  it('uses other when the reply is not the expected object', async () => {
    for (const reply of [null, 'dairy', { categories: 'dairy' }, { items: ['dairy'] }]) {
      const deps = makeDeps({}, { askModel: vi.fn(async () => reply) });
      expect(await categorize(['Milk'], deps)).toEqual({ Milk: 'other' });
      expect(deps.putCached).not.toHaveBeenCalled();
    }
  });

  it('fails when the model cannot be reached', async () => {
    const deps = makeDeps({}, {
      askModel: vi.fn(async () => {
        throw new Error('OpenRouter 503');
      }),
    });
    await expect(categorize(['Milk'], deps)).rejects.toThrow('OpenRouter 503');
  });

  it('returns other for blank text without asking', async () => {
    const deps = makeDeps();
    expect(await categorize(['   '], deps)).toEqual({ '   ': 'other' });
    expect(deps.askModel).not.toHaveBeenCalled();
  });
});

describe('parseModelContent', () => {
  it('parses plain JSON', () => {
    expect(parseModelContent('{"categories":["dairy"]}')).toEqual({ categories: ['dairy'] });
  });

  it('parses JSON wrapped in a code fence', () => {
    expect(parseModelContent('```json\n{"categories":["dairy"]}\n```')).toEqual({ categories: ['dairy'] });
  });

  it('returns null for anything else', () => {
    expect(parseModelContent('Sure! Here you go')).toBeNull();
    expect(parseModelContent(undefined)).toBeNull();
    expect(parseModelContent({ categories: [] })).toBeNull();
  });
});

describe('buildPrompt', () => {
  it('explains where the look-alike categories differ', () => {
    const { system } = buildPrompt(['kebabsås']);
    const line = (category: string) => system.split('\n').find((l) => l.startsWith(`- ${category}:`)) ?? '';
    expect(line('chilled_sauces')).toContain('kebabsås');
    expect(line('chilled_sauces')).toContain('bearnaise');
    expect(line('spices_sauces')).toContain('ketchup');
    expect(line('frozen_sweet')).toContain('glass');
    expect(line('frozen_sweet')).toContain('frysta bär');
    expect(line('frozen')).toMatch(/not ice cream/i);
    for (const category of CATEGORIES) expect(line(category)).not.toBe('');
  });

  it('names every category and numbers the items', () => {
    const { system, user } = buildPrompt(['mjölk', 'äpple']);
    for (const category of CATEGORIES) expect(system).toContain(category);
    expect(system).toContain('Swedish');
    expect(user).toBe('1. mjölk\n2. äpple');
  });
});
