import { positionBetween } from '../domain/position';
import { byManual } from '../domain/sort';
import type { Item, Section } from '../domain/types';
import { newId } from '../domain/newId';
import type { LocalDb } from './localDb';
import type { Outbox } from './outbox';

// Replaces the local copy with the chosen sections of `fromList` (`keep` is
// their ids), re-created under `toList` and queued for sending. Each comes
// along as it is: its own items stay in it. Sections go after
// `lastPosition`, the last section already in `toList`. The rest of the old
// list (other sections, learned store order) is dropped; the server keeps it.
export async function moveSectionsTo(
  db: LocalDb,
  outbox: Outbox,
  fromList: string,
  toList: string,
  keep: string[],
  lastPosition: string | null,
): Promise<number> {
  const [sections, items] = await Promise.all([db.sections.toArray(), db.items.toArray()]);
  const liveItems = items.filter((i) => i.list_id === fromList && !i.deleted_at);
  const moving = sections
    .filter((s) => s.list_id === fromList && !s.deleted_at)
    .filter((s) => keep.includes(s.id))
    .sort(byManual);

  let previous = lastPosition;
  const copies: Section[] = [];
  const ids = new Map<string, string>();
  for (const section of moving) {
    const id = newId();
    ids.set(section.id, id);
    previous = positionBetween(previous, null);
    copies.push({ ...section, id, list_id: toList, position: previous });
  }
  const itemCopies: Item[] = liveItems
    .filter((i) => ids.has(i.section_id))
    .map((i) => ({ ...i, id: newId(), list_id: toList, section_id: ids.get(i.section_id)! }));

  await db.transaction(
    'rw',
    [db.sections, db.items, db.store_orders, db.outbox],
    async () => {
      await Promise.all([db.sections.clear(), db.items.clear(), db.store_orders.clear(), db.outbox.clear()]);
      await db.sections.bulkAdd(copies);
      await db.items.bulkAdd(itemCopies);
      // Sections first: an item needs its section to exist on the server.
      for (const row of copies) {
        await outbox.enqueue({ table: 'sections', kind: 'insert', id: row.id, values: { ...row } });
      }
      for (const row of itemCopies) {
        await outbox.enqueue({ table: 'items', kind: 'insert', id: row.id, values: { ...row } });
      }
    },
  );
  return copies.length;
}
