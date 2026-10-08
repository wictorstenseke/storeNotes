import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../domain/categories';
import { makeStore } from '../test/helpers';
import { Categorizer, type CategorizeCall } from './categorizer';

async function setup(call: CategorizeCall) {
  const { store } = await makeStore();
  const s = () => store.getState();
  const grocery = s().addSection('Grocery List');
  s().setStoreSort(grocery, true);
  const gifts = s().addSection('Gifts');
  const spy = vi.fn(call);
  return { s, grocery, gifts, spy, categorizer: new Categorizer(spy, store) };
}

const allDairy: CategorizeCall = async (texts) =>
  Object.fromEntries(texts.map((t): [string, Category] => [t, 'dairy']));

const category = (s: () => { items: { text: string; category: Category | null }[] }, text: string) =>
  s().items.find((i) => i.text === text)?.category;

describe('Categorizer', () => {
  it('tags untagged items in sections with store sort', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, ['Milk', 'Yoghurt']);
    await categorizer.run();
    expect(spy).toHaveBeenCalledWith(['Milk', 'Yoghurt']);
    expect(category(s, 'Milk')).toBe('dairy');
    expect(category(s, 'Yoghurt')).toBe('dairy');
  });

  it('never sends items from other sections, blank lines or tagged items', async () => {
    const { s, grocery, gifts, spy, categorizer } = await setup(allDairy);
    s().addItem(gifts, 'Lego for Elsa');
    s().addItem(grocery, '');
    const tagged = s().addItem(grocery, 'Bread');
    s().setCategory(tagged, 'bakery', 'Bread');
    await categorizer.run();
    expect(spy).not.toHaveBeenCalled();
    expect(category(s, 'Lego for Elsa')).toBeNull();
  });

  it('sends a repeated text once and tags every item with it', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, ['Milk', 'Milk']);
    await categorizer.run();
    expect(spy).toHaveBeenCalledWith(['Milk']);
    expect(s().items.map((i) => i.category)).toEqual(['dairy', 'dairy']);
  });

  it('discards a result for text that changed while waiting', async () => {
    let finish!: (result: Record<string, Category>) => void;
    const { s, grocery, categorizer } = await setup(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const item = s().addItem(grocery, 'Milk');
    const running = categorizer.run();
    s().setItemText(item, 'Soap');
    finish({ Milk: 'dairy' });
    await running;
    expect(category(s, 'Soap')).toBeNull();
  });

  it('leaves items untagged on failure and tries again next time', async () => {
    let fail = true;
    const { s, grocery, spy, categorizer } = await setup(async (texts) => {
      if (fail) throw new Error('offline');
      return allDairy(texts);
    });
    s().addItem(grocery, 'Milk');
    await categorizer.run();
    expect(category(s, 'Milk')).toBeNull();
    fail = false;
    await categorizer.run();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(category(s, 'Milk')).toBe('dairy');
  });

  it('sends at most 50 texts per call', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, Array.from({ length: 60 }, (_, i) => `Item ${i}`));
    await categorizer.run();
    expect(spy.mock.calls[0][0]).toHaveLength(50);
    expect(s().items.filter((i) => i.category === null)).toHaveLength(10);
    await categorizer.run();
    expect(s().items.filter((i) => i.category === null)).toHaveLength(0);
  });

  it('ignores values that are not categories', async () => {
    const { s, grocery, categorizer } = await setup(
      async () => ({ Milk: 'sweets' }) as unknown as Record<string, Category>,
    );
    s().addItem(grocery, 'Milk');
    await categorizer.run();
    expect(category(s, 'Milk')).toBeNull();
  });

  it('does not start a second run while one is in progress', async () => {
    let finish!: (result: Record<string, Category>) => void;
    const { s, grocery, spy, categorizer } = await setup(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    s().addItem(grocery, 'Milk');
    const first = categorizer.run();
    await categorizer.run();
    expect(spy).toHaveBeenCalledTimes(1);
    finish({ Milk: 'dairy' });
    await first;
  });
});
