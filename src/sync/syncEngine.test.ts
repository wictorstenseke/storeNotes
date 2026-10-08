import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortOpen } from '../domain/sort';
import { FakeRemote } from '../test/fakeRemote';
import { makeStore } from '../test/helpers';
import { SyncEngine } from './syncEngine';

const engines: SyncEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.stop();
});

async function client(remote: FakeRemote, prefix: string) {
  let n = 0;
  const ctx = await makeStore({ newId: () => `${prefix}-${++n}` });
  const hooks = { onChange: vi.fn(), onRejected: vi.fn() };
  const engine = new SyncEngine(ctx.db, ctx.outbox, remote, 'list-1', hooks);
  engines.push(engine);
  const applying: Promise<void>[] = [];
  remote.subscribe('list-1', (table, row) => {
    applying.push(engine.applyRemote(table, row));
  });
  const s = () => ctx.store.getState();
  // Write local changes, send them, take in everything echoed back, reload memory.
  const settle = async () => {
    await s().idle();
    await engine.flush();
    await Promise.all(applying.splice(0));
    await s().reload();
  };
  return { ...ctx, engine, hooks, s, settle };
}

const texts = (c: Awaited<ReturnType<typeof client>>) => sortOpen(c.s().items, null).map((i) => i.text);

describe('flush', () => {
  it('sends queued changes in order and empties the outbox', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    a.s().checkItem(item, null);
    await a.settle();
    expect(remote.sent.map((m) => `${m.table}:${m.kind}`)).toEqual([
      'sections:insert',
      'items:insert',
      'items:patch',
    ]);
    expect(await a.outbox.count()).toBe(0);
    expect(remote.rows.items.get(item)).toMatchObject({ text: 'Milk', checked: true });
  });

  it('keeps changes queued when the network fails and sends them later', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    remote.mode = 'transient';
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'Milk');
    await a.settle();
    expect(remote.sent).toEqual([]);
    expect(await a.outbox.count()).toBe(2);
    remote.mode = 'ok';
    await a.settle();
    expect(await a.outbox.count()).toBe(0);
    expect(remote.rows.items.size).toBe(1);
  });

  it('drops a change the server refuses, reports it and restores the server state', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    await a.settle();
    remote.mode = 'permanent';
    a.s().addItem(section, 'Refused');
    await a.settle();
    expect(await a.outbox.count()).toBe(0);
    expect(a.hooks.onRejected).toHaveBeenCalledTimes(1);
    expect(texts(a)).toEqual([]);
    expect(a.s().sections).toHaveLength(1);
  });

  it('still sends an edit made while the insert of the same item is in flight', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    await a.settle();

    let open!: () => void;
    remote.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const item = a.s().addItem(section, 'Milk');
    await a.s().idle();
    const flushing = a.engine.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    a.s().setItemText(item, 'Oat milk');
    await a.s().idle();
    remote.gate = null;
    open();
    await flushing;
    await a.settle();

    expect(remote.rows.items.get(item)?.text).toBe('Oat milk');
    expect(await a.outbox.count()).toBe(0);
  });
});

describe('incoming changes', () => {
  it('keeps fields with a pending local change and takes the rest', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    await a.settle();

    remote.mode = 'transient';
    a.s().setItemText(item, 'Oat milk');
    await a.settle();

    await a.engine.applyRemote('items', { ...remote.rows.items.get(item)!, text: 'Mjölk', checked: true });
    await a.s().reload();
    expect(a.s().items[0]).toMatchObject({ text: 'Oat milk', checked: true });
    expect(a.hooks.onChange).toHaveBeenCalled();
  });

  it('removes a row that arrives deleted', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    await a.settle();
    await a.engine.applyRemote('items', { ...remote.rows.items.get(item)!, deleted_at: '2026-10-08T11:00:00Z' });
    await a.s().reload();
    expect(a.s().items).toEqual([]);
    expect(await a.db.items.get(item)).toBeUndefined();
  });
});

describe('refetch', () => {
  it('drops rows the server no longer has and keeps rows not yet sent', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const [gone] = a.s().addItems(section, ['Gone', 'Stays']);
    await a.settle();

    remote.rows.items.delete(gone);
    remote.mode = 'transient';
    a.s().addItem(section, 'Unsent');
    await a.settle();

    await a.engine.refetch();
    await a.s().reload();
    expect(texts(a)).toEqual(['Stays', 'Unsent']);
  });

  it('leaves the local copy alone when the server cannot be reached', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'Milk');
    await a.settle();
    remote.offline = true;
    remote.rows.items.clear();
    await a.engine.refetch();
    await a.s().reload();
    expect(texts(a)).toEqual(['Milk']);
  });
});

describe('two devices', () => {
  it('keeps both items when both insert at the same position', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const b = await client(remote, 'b');
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'First');
    await a.settle();
    await b.engine.refetch();
    await b.s().reload();
    expect(texts(b)).toEqual(['First']);

    const fromA = a.s().addItem(section, 'From A');
    const fromB = b.s().addItem(section, 'From B');
    const position = (c: typeof a, id: string) => c.s().items.find((i) => i.id === id)!.position;
    expect(position(a, fromA)).toBe(position(b, fromB));

    await a.settle();
    await b.settle();
    await a.settle();

    expect(texts(a)).toEqual(['First', 'From A', 'From B']);
    expect(texts(b)).toEqual(texts(a));
  });

  it('merges different fields changed on the same item', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const b = await client(remote, 'b');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Mlik');
    await a.settle();
    await b.engine.refetch();
    await b.s().reload();

    a.s().checkItem(item, null);
    b.s().setItemText(item, 'Milk');
    await a.settle();
    await b.settle();
    await a.settle();

    expect(remote.rows.items.get(item)).toMatchObject({ text: 'Milk', checked: true });
    expect(a.s().items[0]).toMatchObject({ text: 'Milk', checked: true });
    expect(b.s().items[0]).toMatchObject({ text: 'Milk', checked: true });
  });
});
