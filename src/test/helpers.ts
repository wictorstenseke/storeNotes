import { createNoteStore, type NoteDeps, type NoteStore } from '../state/noteStore';
import { LocalDb } from '../sync/localDb';
import { Outbox } from '../sync/outbox';

export async function makeStore(
  deps: Partial<NoteDeps> = {},
): Promise<{ db: LocalDb; outbox: Outbox; store: NoteStore }> {
  const db = deps.db ?? new LocalDb(`note-${Math.random()}`);
  const outbox = deps.outbox ?? new Outbox(db);
  let ids = 0;
  let ticks = 0;
  const store = createNoteStore({
    newId: () => `id-${String(++ids).padStart(3, '0')}`,
    now: () => new Date(Date.UTC(2026, 9, 8, 10, 0, ticks++)).toISOString(),
    ...deps,
    db,
    outbox,
  });
  await store.getState().load('list-1');
  return { db, outbox, store };
}
