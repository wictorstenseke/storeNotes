import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';
import { moveSectionsTo } from './transfer';
import { makeStore } from '../test/helpers';

let db: LocalDb;
let outbox: Outbox;
let food: string;
let gifts: string;
let empty: string;

beforeEach(async () => {
  const made = await makeStore();
  db = made.db;
  outbox = made.outbox;
  const note = made.store.getState();
  food = note.addSection('Mat');
  note.addItems(food, ['Mjölk', 'Ägg']);
  gifts = note.addSection('Presenter');
  note.addItems(gifts, ['Lego']);
  empty = note.addSection('Tom');
  await note.idle();
});

describe('moveSectionsTo', () => {
  it('re-creates sections with items under the other list, after the last position', async () => {
    const moved = await moveSectionsTo(db, outbox, 'list-1', 'list-2', [food, gifts], 'a5');
    expect(moved).toBe(2);
    const sections = (await db.sections.toArray()).sort((a, b) => (a.position < b.position ? -1 : 1));
    expect(sections.map((s) => [s.title, s.list_id])).toEqual([
      ['Mat', 'list-2'],
      ['Presenter', 'list-2'],
    ]);
    expect(sections.every((s) => s.position > 'a5')).toBe(true);
    expect(sections[0].position < sections[1].position).toBe(true);
  });

  it('moves the items with their section and drops the old rows', async () => {
    await moveSectionsTo(db, outbox, 'list-1', 'list-2', [food, gifts], null);
    const sections = await db.sections.toArray();
    const items = await db.items.toArray();
    expect(items.map((i) => i.text).sort()).toEqual(['Lego', 'Mjölk', 'Ägg']);
    expect(items.every((i) => i.list_id === 'list-2')).toBe(true);
    const mat = sections.find((s) => s.title === 'Mat')!;
    expect(items.filter((i) => i.section_id === mat.id).map((i) => i.text).sort()).toEqual(['Mjölk', 'Ägg']);
  });

  it('queues sections before their items, and nothing from before', async () => {
    await moveSectionsTo(db, outbox, 'list-1', 'list-2', [food, gifts], null);
    const queued = await db.outbox.orderBy('seq').toArray();
    expect(queued.map((m) => m.table)).toEqual(['sections', 'sections', 'items', 'items', 'items']);
    expect(queued.every((m) => m.kind === 'insert')).toBe(true);
  });

  it('takes only the chosen sections, also an empty one', async () => {
    await moveSectionsTo(db, outbox, 'list-1', 'list-2', [empty, gifts], null);
    expect((await db.sections.toArray()).map((s) => s.title).sort()).toEqual(['Presenter', 'Tom']);
    expect((await db.items.toArray()).map((i) => i.text)).toEqual(['Lego']);
  });

  it('moves nothing when nothing is chosen, but still clears the old list', async () => {
    expect(await moveSectionsTo(db, outbox, 'list-1', 'list-2', [], null)).toBe(0);
    expect(await db.sections.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
