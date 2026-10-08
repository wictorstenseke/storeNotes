import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';

let db: LocalDb;
let outbox: Outbox;

beforeEach(() => {
  db = new LocalDb(`outbox-${Math.random()}`);
  outbox = new Outbox(db);
});

const all = () => db.outbox.orderBy('seq').toArray();

describe('Outbox', () => {
  it('keeps mutations in the order they were queued', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a' } });
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'b', values: { id: 'b' } });
    expect((await all()).map((m) => m.id)).toEqual(['a', 'b']);
    expect((await outbox.next())?.id).toBe('a');
    expect(await outbox.count()).toBe(2);
  });

  it('merges a patch into the previous patch for the same row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Mil' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Milk', checked: true } });
    const queued = await all();
    expect(queued).toHaveLength(1);
    expect(queued[0].values).toEqual({ text: 'Milk', checked: true });
  });

  it('does not merge a patch into an insert', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a', text: '' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Milk' } });
    const queued = await all();
    expect(queued.map((m) => m.kind)).toEqual(['insert', 'patch']);
    expect(queued[0].values).toEqual({ id: 'a', text: '' });
  });

  it('does not merge across a mutation for another row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'b', values: { text: 'B' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect((await all()).map((m) => m.id)).toEqual(['a', 'b', 'a']);
  });

  it('does not merge into the mutation that is in flight', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.next();
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect(await outbox.count()).toBe(2);
  });

  it('merges again after the in-flight mutation is released', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.next();
    outbox.release();
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect(await outbox.count()).toBe(1);
  });

  it('removes a mutation when it is done', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a' } });
    const first = await outbox.next();
    await outbox.done(first!.seq!);
    expect(await outbox.count()).toBe(0);
    expect(await outbox.next()).toBeUndefined();
  });

  it('replaces a queued upsert for the same store order', async () => {
    await outbox.enqueue({ table: 'store_orders', kind: 'upsert', id: 's1', values: { store_id: 's1', scores: { a: 1 } } });
    await outbox.enqueue({ table: 'store_orders', kind: 'upsert', id: 's1', values: { store_id: 's1', scores: { a: 2 } } });
    const queued = await all();
    expect(queued).toHaveLength(1);
    expect(queued[0].values).toEqual({ store_id: 's1', scores: { a: 2 } });
  });

  it('reports the pending fields per row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a', text: '' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { checked: true } });
    await outbox.enqueue({ table: 'sections', kind: 'patch', id: 's', values: { title: 'X' } });
    const pending = await outbox.pendingFields();
    expect([...pending.get('items:a')!].sort()).toEqual(['checked', 'id', 'text']);
    expect([...pending.get('sections:s')!]).toEqual(['title']);
    expect(pending.get('items:zzz')).toBeUndefined();
  });
});
