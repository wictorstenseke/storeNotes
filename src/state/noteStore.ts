import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Category } from '../domain/categories';
import { baselineScores, learnFromDone } from '../domain/learning';
import { newId as defaultNewId } from '../domain/newId';
import { positionBetween } from '../domain/position';
import { byManual, sortOpen } from '../domain/sort';
import { STORES, type StoreDef } from '../domain/stores';
import type { Item, Section, StoreOrder } from '../domain/types';
import type { LocalDb, Mutation } from '../sync/localDb';
import type { Outbox } from '../sync/outbox';

export type NoteState = {
  listId: string | null;
  sections: Section[];
  items: Item[];
  storeOrders: StoreOrder[];
  ready: boolean;
};

export type NoteActions = {
  load(listId: string): Promise<void>;
  reload(): Promise<void>;
  idle(): Promise<void>;
  addItem(sectionId: string, text: string, afterId?: string | null): string;
  addItems(sectionId: string, texts: string[]): string[];
  setItemText(id: string, text: string): void;
  setCategory(id: string, category: Category, forText: string): void;
  checkItem(id: string, storeId: string | null): void;
  uncheckItem(id: string): void;
  moveItem(id: string, toIndex: number): void;
  deleteItem(id: string): void;
  clearDone(sectionId: string): void;
  setStoreOrder(storeId: string, order: Category[]): void;
  resetStoreOrder(storeId: string): void;
  addSection(title?: string): string;
  renameSection(id: string, title: string): void;
  setStoreSort(id: string, on: boolean): void;
  deleteSection(id: string): void;
};

export type NoteDeps = {
  db: LocalDb;
  outbox: Outbox;
  now?: () => string;
  newId?: () => string;
  onLocalWrite?: () => void;
  stores?: StoreDef[];
};

export type NoteStore = StoreApi<NoteState & NoteActions>;

type Op = Omit<Mutation, 'seq'>;

export function createNoteStore(deps: NoteDeps): NoteStore {
  const { db, outbox } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultNewId;
  const stores = deps.stores ?? STORES;

  // All IndexedDB work runs through one queue so reads never overtake writes.
  let queue: Promise<void> = Promise.resolve();
  let writes = 0;

  const run = (fn: () => Promise<void>): Promise<void> => {
    queue = queue.then(fn).catch((error) => console.error(error));
    return queue;
  };

  const persist = (ops: Op[]): void => {
    if (ops.length === 0) return;
    writes += 1;
    void run(async () => {
      try {
        await db.transaction('rw', [db.sections, db.items, db.store_orders, db.outbox], async () => {
          for (const op of ops) {
            if (op.table === 'store_orders') {
              await db.store_orders.put(op.values as StoreOrder);
            } else if (op.kind === 'insert') {
              await db.table(op.table).put(op.values);
            } else {
              await db.table(op.table).update(op.id, op.values);
            }
            await outbox.enqueue(op);
          }
        });
      } finally {
        writes -= 1;
      }
      deps.onLocalWrite?.();
    });
  };

  return createStore<NoteState & NoteActions>()((set, get) => {
    const listId = (): string => {
      const id = get().listId;
      if (!id) throw new Error('No list loaded');
      return id;
    };

    const findItem = (id: string) => get().items.find((i) => i.id === id);
    const findSection = (id: string) => get().sections.find((s) => s.id === id);

    const patchItem = (id: string, values: Partial<Item>): void => {
      set({ items: get().items.map((i) => (i.id === id ? { ...i, ...values } : i)) });
      persist([{ table: 'items', kind: 'patch', id, values }]);
    };

    const patchSection = (id: string, values: Partial<Section>): void => {
      set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...values } : s)) });
      persist([{ table: 'sections', kind: 'patch', id, values }]);
    };

    const reload = (): Promise<void> =>
      run(async () => {
        const id = get().listId;
        if (!id) return;
        const [sections, items, storeOrders] = await Promise.all([
          db.sections.toArray(),
          db.items.toArray(),
          db.store_orders.toArray(),
        ]);
        // A local change was made while reading. Its write is queued behind
        // this read, so read again after it instead of overwriting memory.
        if (writes > 0) {
          void reload();
          return;
        }
        set({
          sections: sections.filter((s) => s.list_id === id && !s.deleted_at),
          items: items.filter((i) => i.list_id === id && !i.deleted_at),
          storeOrders: storeOrders.filter((o) => o.list_id === id),
          ready: true,
        });
      });

    return {
      listId: null,
      sections: [],
      items: [],
      storeOrders: [],
      ready: false,

      load: (id) => {
        set({ listId: id });
        return reload();
      },
      reload,
      idle: () => queue,

      addItem: (sectionId, text, afterId = null) => {
        const all = get().items.filter((i) => i.section_id === sectionId).sort(byManual);
        const at = afterId ? all.findIndex((i) => i.id === afterId) : -1;
        const before = at >= 0 ? all[at].position : (all[all.length - 1]?.position ?? null);
        const after = at >= 0 ? (all[at + 1]?.position ?? null) : null;
        const row: Item = {
          id: newId(),
          list_id: listId(),
          section_id: sectionId,
          text,
          position: positionBetween(before, after),
          checked: false,
          checked_at: null,
          checked_store: null,
          category: null,
          updated_at: now(),
          deleted_at: null,
        };
        set({ items: [...get().items, row] });
        persist([{ table: 'items', kind: 'insert', id: row.id, values: { ...row } }]);
        return row.id;
      },

      addItems: (sectionId, texts) => texts.map((text) => get().addItem(sectionId, text)),

      setItemText: (id, text) => {
        const item = findItem(id);
        if (!item || item.text === text) return;
        patchItem(id, { text, category: null });
      },

      setCategory: (id, category, forText) => {
        const item = findItem(id);
        if (!item || item.text !== forText || item.category === category) return;
        patchItem(id, { category });
      },

      checkItem: (id, storeId) => {
        const item = findItem(id);
        if (!item || item.checked) return;
        patchItem(id, { checked: true, checked_at: now(), checked_store: storeId });
      },

      uncheckItem: (id) => {
        const item = findItem(id);
        if (!item || !item.checked) return;
        patchItem(id, { checked: false, checked_at: null, checked_store: null });
      },

      moveItem: (id, toIndex) => {
        const item = findItem(id);
        if (!item) return;
        const rest = sortOpen(
          get().items.filter((i) => i.section_id === item.section_id),
          null,
        ).filter((i) => i.id !== id);
        const before = rest[toIndex - 1]?.position ?? null;
        const after = rest[toIndex]?.position ?? null;
        patchItem(id, { position: positionBetween(before, after) });
      },

      deleteItem: (id) => {
        if (!findItem(id)) return;
        set({ items: get().items.filter((i) => i.id !== id) });
        persist([{ table: 'items', kind: 'patch', id, values: { deleted_at: now() } }]);
      },

      clearDone: (sectionId) => {
        const done = get().items.filter((i) => i.section_id === sectionId && i.checked);
        if (done.length === 0) return;
        const current = Object.fromEntries(get().storeOrders.map((o) => [o.store_id, o.scores]));
        const learned = learnFromDone(done, stores, current);
        const stamp = now();
        const ops: Op[] = [];
        const orders = get().storeOrders.filter((o) => !(o.store_id in learned));
        for (const [store_id, scores] of Object.entries(learned)) {
          const row: StoreOrder = { list_id: listId(), store_id, scores, updated_at: stamp };
          orders.push(row);
          ops.push({ table: 'store_orders', kind: 'upsert', id: store_id, values: { ...row } });
        }
        for (const item of done) {
          ops.push({ table: 'items', kind: 'patch', id: item.id, values: { deleted_at: stamp } });
        }
        const gone = new Set(done.map((i) => i.id));
        set({ items: get().items.filter((i) => !gone.has(i.id)), storeOrders: orders });
        persist(ops);
      },

      // An order set by hand is stored the same way as a learned one (a score
      // per category), so it syncs and check-offs keep adjusting it.
      setStoreOrder: (storeId, order) => {
        const row: StoreOrder = {
          list_id: listId(),
          store_id: storeId,
          scores: baselineScores(order),
          updated_at: now(),
        };
        set({ storeOrders: [...get().storeOrders.filter((o) => o.store_id !== storeId), row] });
        persist([{ table: 'store_orders', kind: 'upsert', id: storeId, values: { ...row } }]);
      },

      resetStoreOrder: (storeId) => {
        const store = stores.find((s) => s.id === storeId);
        if (store) get().setStoreOrder(storeId, store.baseline);
      },

      addSection: (title = '') => {
        const last = [...get().sections].sort(byManual).at(-1);
        const row: Section = {
          id: newId(),
          list_id: listId(),
          title,
          position: positionBetween(last?.position ?? null, null),
          store_sort: false,
          updated_at: now(),
          deleted_at: null,
        };
        set({ sections: [...get().sections, row] });
        persist([{ table: 'sections', kind: 'insert', id: row.id, values: { ...row } }]);
        return row.id;
      },

      renameSection: (id, title) => {
        const section = findSection(id);
        if (!section || section.title === title) return;
        patchSection(id, { title });
      },

      setStoreSort: (id, on) => {
        const section = findSection(id);
        if (!section || section.store_sort === on) return;
        patchSection(id, { store_sort: on });
      },

      deleteSection: (id) => {
        if (!findSection(id)) return;
        const stamp = now();
        const items = get().items.filter((i) => i.section_id === id);
        set({
          sections: get().sections.filter((s) => s.id !== id),
          items: get().items.filter((i) => i.section_id !== id),
        });
        persist([
          ...items.map((i): Op => ({ table: 'items', kind: 'patch', id: i.id, values: { deleted_at: stamp } })),
          { table: 'sections', kind: 'patch', id, values: { deleted_at: stamp } },
        ]);
      },
    };
  });
}
