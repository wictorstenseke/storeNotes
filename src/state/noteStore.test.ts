import { describe, expect, it } from 'vitest';
import type { Category } from '../domain/categories';
import { effectiveOrder } from '../domain/learning';
import { byManual, sortOpen } from '../domain/sort';
import type { StoreDef } from '../domain/stores';
import { makeStore } from '../test/helpers';

const BASE: Category[] = ['produce', 'dairy', 'frozen', 'candy', 'other'];
const STORE: StoreDef = { id: 's1', name: 'S1', baseline: BASE };

async function withSection() {
  const ctx = await makeStore({ stores: [STORE] });
  const sectionId = ctx.store.getState().addSection('Grocery List');
  await ctx.store.getState().idle();
  return { ...ctx, sectionId, s: () => ctx.store.getState() };
}

const queued = async (ctx: Awaited<ReturnType<typeof withSection>>) =>
  (await ctx.db.outbox.orderBy('seq').toArray()).map((m) => `${m.table}:${m.kind}:${m.id}`);

describe('items', () => {
  it('adds an item at the end, in memory at once and then on disk', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    const b = ctx.s().addItem(ctx.sectionId, 'Eggs');
    expect(ctx.s().items.map((i) => i.text)).toEqual(['Milk', 'Eggs']);
    const [first, second] = ctx.s().items;
    expect(first.position < second.position).toBe(true);
    await ctx.s().idle();
    expect((await ctx.db.items.get(a))?.text).toBe('Milk');
    expect(await queued(ctx)).toEqual([
      `sections:insert:${ctx.sectionId}`,
      `items:insert:${a}`,
      `items:insert:${b}`,
    ]);
  });

  it('adds an item directly after another', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'A');
    ctx.s().addItem(ctx.sectionId, 'C');
    ctx.s().addItem(ctx.sectionId, 'B', a);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('adds several items in order', async () => {
    const ctx = await withSection();
    ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('clears the category when the text changes, and does nothing when it does not', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().setCategory(a, 'dairy', 'Milk');
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().setItemText(a, 'Milk');
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
    ctx.s().setItemText(a, 'Oat milk');
    expect(ctx.s().items[0]).toMatchObject({ text: 'Oat milk', category: null });
  });

  it('ignores a category that was computed for older text', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().setItemText(a, 'Soap');
    ctx.s().setCategory(a, 'dairy', 'Milk');
    expect(ctx.s().items[0].category).toBeNull();
  });

  it('checks and unchecks', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().checkItem(a, 's1');
    expect(ctx.s().items[0]).toMatchObject({ checked: true, checked_store: 's1' });
    expect(ctx.s().items[0].checked_at).not.toBeNull();
    ctx.s().uncheckItem(a);
    expect(ctx.s().items[0]).toMatchObject({ checked: false, checked_at: null, checked_store: null });
  });

  it('moves an item to a new index', async () => {
    const ctx = await withSection();
    const [a, , c] = ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    ctx.s().moveItem(c, 0);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['C', 'A', 'B']);
    ctx.s().moveItem(a, 2);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['C', 'B', 'A']);
  });

  it('moves a section to a new index', async () => {
    const ctx = await withSection();
    const a = ctx.sectionId;
    const b = ctx.s().addSection('B');
    const c = ctx.s().addSection('C');
    const order = () => [...ctx.s().sections].sort(byManual).map((s) => s.id);
    expect(order()).toEqual([a, b, c]);
    ctx.s().moveSection(c, 0);
    expect(order()).toEqual([c, a, b]);
    ctx.s().moveSection(c, 2);
    expect(order()).toEqual([a, b, c]);
    ctx.s().moveSection('nope', 0);
    await ctx.s().idle();
    // Saved, and an unknown id changes nothing.
    expect((await queued(ctx)).filter((q) => q.startsWith('sections:patch'))).toEqual([`sections:patch:${c}`]);
  });

  it('soft-deletes an item', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().deleteItem(a);
    expect(ctx.s().items).toEqual([]);
    await ctx.s().idle();
    expect((await ctx.db.items.get(a))?.deleted_at).not.toBeNull();
    expect((await queued(ctx)).at(-1)).toBe(`items:patch:${a}`);
  });

  it('ignores actions for unknown ids', async () => {
    const ctx = await withSection();
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().setItemText('nope', 'x');
    ctx.s().checkItem('nope', null);
    ctx.s().uncheckItem('nope');
    ctx.s().moveItem('nope', 0);
    ctx.s().deleteItem('nope');
    ctx.s().setCategory('nope', 'dairy', 'x');
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
  });
});

describe('clearDone', () => {
  it('learns the store order from the trip and deletes the Done items', async () => {
    const ctx = await withSection();
    const [ice, milk, apple, keep] = ctx.s().addItems(ctx.sectionId, ['Ice', 'Milk', 'Apple', 'Keep']);
    ctx.s().setCategory(ice, 'frozen', 'Ice');
    ctx.s().setCategory(milk, 'dairy', 'Milk');
    ctx.s().setCategory(apple, 'produce', 'Apple');
    ctx.s().checkItem(ice, 's1');
    ctx.s().checkItem(milk, 's1');
    ctx.s().checkItem(apple, 's1');
    ctx.s().clearDone(ctx.sectionId);

    expect(ctx.s().items.map((i) => i.id)).toEqual([keep]);
    expect(ctx.s().storeOrders).toHaveLength(1);
    expect(ctx.s().storeOrders[0].store_id).toBe('s1');
    expect(ctx.s().storeOrders[0].scores.produce).toBeCloseTo(0.3);

    await ctx.s().idle();
    expect(await ctx.db.store_orders.get(['list-1', 's1'])).toBeDefined();
    expect(await queued(ctx)).toContain('store_orders:upsert:s1');
  });

  it('clears Done items it cannot learn from without touching store orders', async () => {
    const ctx = await withSection();
    const [a, b, c] = ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    ctx.s().setCategory(b, 'dairy', 'B');
    ctx.s().checkItem(a, 's1');
    ctx.s().checkItem(b, 'closed-store');
    ctx.s().checkItem(c, null);
    ctx.s().clearDone(ctx.sectionId);
    expect(ctx.s().items).toEqual([]);
    expect(ctx.s().storeOrders).toEqual([]);
    await ctx.s().idle();
    expect(await ctx.db.store_orders.count()).toBe(0);
  });

  it('does nothing when there are no Done items', async () => {
    const ctx = await withSection();
    ctx.s().addItem(ctx.sectionId, 'A');
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().clearDone(ctx.sectionId);
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
  });
});

describe('sections', () => {
  it('adds sections in order with store sort off', async () => {
    const ctx = await withSection();
    const second = ctx.s().addSection('Gifts');
    const [a, b] = ctx.s().sections;
    expect(a.position < b.position).toBe(true);
    expect(b).toMatchObject({ id: second, title: 'Gifts', store_sort: false });
  });

  it('renames and toggles store sort', async () => {
    const ctx = await withSection();
    ctx.s().renameSection(ctx.sectionId, 'Food');
    ctx.s().setStoreSort(ctx.sectionId, true);
    expect(ctx.s().sections[0]).toMatchObject({ title: 'Food', store_sort: true });
  });

  it('deletes a section and its items', async () => {
    const ctx = await withSection();
    const other = ctx.s().addSection('Gifts');
    ctx.s().addItem(ctx.sectionId, 'Milk');
    const lego = ctx.s().addItem(other, 'Lego');
    ctx.s().deleteSection(ctx.sectionId);
    expect(ctx.s().sections.map((x) => x.id)).toEqual([other]);
    expect(ctx.s().items.map((x) => x.id)).toEqual([lego]);
  });
});

describe('loading', () => {
  it('reads the list back from disk without soft-deleted rows', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    const b = ctx.s().addItem(ctx.sectionId, 'Eggs');
    ctx.s().deleteItem(b);
    await ctx.s().idle();

    const again = await makeStore({ db: ctx.db, outbox: ctx.outbox });
    expect(again.store.getState().ready).toBe(true);
    expect(again.store.getState().items.map((i) => i.id)).toEqual([a]);
    expect(again.store.getState().sections).toHaveLength(1);
  });

  it('does not lose a change made while a reload is reading', async () => {
    const ctx = await withSection();
    const reloading = ctx.s().reload();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    await reloading;
    await ctx.s().idle();
    expect(ctx.s().items.map((i) => i.id)).toEqual([a]);
  });
});

describe('store order set by hand', () => {
  const scoresFor = (ctx: Awaited<ReturnType<typeof withSection>>) =>
    ctx.s().storeOrders.find((o) => o.store_id === 's1')?.scores;

  it('saves the order so that it becomes the effective order, and queues it for sync', async () => {
    const ctx = await withSection();
    const order: Category[] = ['candy', 'produce', 'other', 'dairy', 'frozen'];
    ctx.s().setStoreOrder('s1', order);
    expect(effectiveOrder(BASE, scoresFor(ctx))).toEqual(order);
    await ctx.s().idle();
    expect(await ctx.db.store_orders.get(['list-1', 's1'])).toBeDefined();
    expect(await queued(ctx)).toContain('store_orders:upsert:s1');
  });

  it('replaces an earlier order for the same store', async () => {
    const ctx = await withSection();
    ctx.s().setStoreOrder('s1', ['candy', 'produce', 'other', 'dairy', 'frozen']);
    ctx.s().setStoreOrder('s1', ['other', 'frozen', 'dairy', 'candy', 'produce']);
    expect(ctx.s().storeOrders).toHaveLength(1);
    expect(effectiveOrder(BASE, scoresFor(ctx))).toEqual(['other', 'frozen', 'dairy', 'candy', 'produce']);
  });

  it('goes back to the original order on reset', async () => {
    const ctx = await withSection();
    ctx.s().setStoreOrder('s1', ['candy', 'produce', 'other', 'dairy', 'frozen']);
    ctx.s().resetStoreOrder('s1');
    expect(effectiveOrder(BASE, scoresFor(ctx))).toEqual(BASE);
  });

  it('ignores a reset for a store that is not defined', async () => {
    const ctx = await withSection();
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().resetStoreOrder('closed-store');
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
  });

  it('keeps learning from check-offs, starting from the order set by hand', async () => {
    const ctx = await withSection();
    // By hand: frozen first. The trip then checks produce, dairy, frozen in that order.
    ctx.s().setStoreOrder('s1', ['frozen', 'dairy', 'produce', 'candy', 'other']);
    const [apple, milk, ice] = ctx.s().addItems(ctx.sectionId, ['Apple', 'Milk', 'Ice']);
    ctx.s().setCategory(apple, 'produce', 'Apple');
    ctx.s().setCategory(milk, 'dairy', 'Milk');
    ctx.s().setCategory(ice, 'frozen', 'Ice');
    ctx.s().checkItem(apple, 's1');
    ctx.s().checkItem(milk, 's1');
    ctx.s().checkItem(ice, 's1');
    ctx.s().clearDone(ctx.sectionId);
    const scores = scoresFor(ctx)!;
    // frozen was 0 by hand and was checked last (1): 0.7 * 0 + 0.3 * 1
    expect(scores.frozen).toBeCloseTo(0.3);
    // produce was 0.5 by hand and was checked first (0): 0.7 * 0.5 + 0.3 * 0
    expect(scores.produce).toBeCloseTo(0.35);
  });
});
