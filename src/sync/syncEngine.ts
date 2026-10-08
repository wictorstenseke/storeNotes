import type { IndexableType } from 'dexie';
import type { Item, Section, StoreOrder } from '../domain/types';
import type { LocalDb, Mutation, TableName } from './localDb';
import type { Outbox } from './outbox';

export type Row = Record<string, unknown>;
export type RemoteResult = { ok: true } | { ok: false; permanent: boolean };
export type Snapshot = { sections: Section[]; items: Item[]; store_orders: StoreOrder[] };

export interface Remote {
  send(m: Mutation): Promise<RemoteResult>;
  fetchAll(listId: string): Promise<Snapshot | null>;
  subscribe(
    listId: string,
    onRow: (table: TableName, row: Row) => void,
    onRejoin: () => void,
  ): () => void;
}

export type SyncHooks = {
  onChange(): void;
  onRejected(): void;
  onStatus?(pending: number): void;
};

const TABLES: TableName[] = ['sections', 'items', 'store_orders'];
const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 60000;

const keyOf = (table: TableName, row: Row): string =>
  String(table === 'store_orders' ? row.store_id : row.id);

const primaryKey = (table: TableName, row: Row): IndexableType =>
  (table === 'store_orders' ? [row.list_id, row.store_id] : row.id) as IndexableType;

// The incoming row wins, except for fields with a local change not yet sent.
function merge(local: Row | undefined, incoming: Row, fields: Set<string> | undefined): Row {
  if (!local || !fields) return incoming;
  const merged = { ...incoming };
  for (const field of fields) {
    if (field in local) merged[field] = local[field];
  }
  return merged;
}

export class SyncEngine {
  private current: Promise<void> | null = null;
  private again = false;
  // Counts changes to the local copy that came from the server side: an
  // acknowledged mutation or an applied remote row. A snapshot fetched before
  // the count moved may be older than what is already stored.
  private epoch = 0;
  private stalled = false;
  private rejected = false;
  private stopped = false;
  private retryMs = FIRST_RETRY_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private db: LocalDb,
    private outbox: Outbox,
    private remote: Remote,
    private listId: string,
    private hooks: SyncHooks,
  ) {}

  // Send everything queued. A call made while a flush is running waits for
  // that flush, which also picks up whatever was queued in the meantime.
  flush(): Promise<void> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    const running = this.run();
    this.current = running;
    return running;
  }

  private async run(): Promise<void> {
    try {
      do {
        this.again = false;
        await this.drain();
        this.hooks.onStatus?.(await this.outbox.count());
        if (this.rejected) {
          this.rejected = false;
          this.hooks.onRejected();
          await this.refetch();
        }
      } while (this.again && !this.stalled);
    } finally {
      // Cleared before returning, so a caller can never be handed a finished run.
      this.current = null;
    }
    if (this.stalled) this.retryLater();
    else this.retryMs = FIRST_RETRY_MS;
  }

  private async drain(): Promise<void> {
    this.stalled = false;
    for (;;) {
      const mutation = await this.outbox.next();
      if (!mutation) return;
      const result = await this.remote.send(mutation);
      if (!result.ok && !result.permanent) {
        this.outbox.release();
        this.stalled = true;
        return;
      }
      if (!result.ok) this.rejected = true;
      this.epoch += 1;
      await this.outbox.done(mutation.seq!);
    }
  }

  private retryLater(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  async refetch(): Promise<void> {
    const { db } = this;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const epoch = this.epoch;
      const snapshot = await this.remote.fetchAll(this.listId);
      if (!snapshot) return;
      const applied = await db.transaction(
        'rw',
        [db.sections, db.items, db.store_orders, db.outbox],
        async () => {
          const pending = await this.outbox.pendingFields();
          // Something was acknowledged or arrived while the fetch was out, so
          // this snapshot may be older than the local copy. Fetch again.
          if (epoch !== this.epoch) return false;
          for (const table of TABLES) {
            const store = db.table(table);
            const seen = new Set<string>();
            for (const row of snapshot[table] as Row[]) {
              const key = keyOf(table, row);
              seen.add(key);
              const local = (await store.get(primaryKey(table, row))) as Row | undefined;
              await store.put(merge(local, row, pending.get(`${table}:${key}`)));
            }
            for (const local of (await store.toArray()) as Row[]) {
              const key = keyOf(table, local);
              if (!seen.has(key) && !pending.has(`${table}:${key}`)) {
                await store.delete(primaryKey(table, local));
              }
            }
          }
          return true;
        },
      );
      if (applied) {
        this.hooks.onChange();
        return;
      }
    }
  }

  async applyRemote(table: TableName, row: Row): Promise<void> {
    const { db } = this;
    this.epoch += 1;
    await db.transaction('rw', [db.sections, db.items, db.store_orders, db.outbox], async () => {
      const store = db.table(table);
      const key = primaryKey(table, row);
      if (table !== 'store_orders' && row.deleted_at) {
        await store.delete(key);
        return;
      }
      const pending = await this.outbox.pendingFields();
      const local = (await store.get(key)) as Row | undefined;
      await store.put(merge(local, row, pending.get(`${table}:${keyOf(table, row)}`)));
    });
    this.hooks.onChange();
  }

  async sync(): Promise<void> {
    await this.flush();
    if (!this.stalled) await this.refetch();
  }

  start(): () => void {
    const unsubscribe = this.remote.subscribe(
      this.listId,
      (table, row) => void this.applyRemote(table, row),
      () => void this.sync(),
    );
    // Realtime does not replay what was missed, so catch up whenever the app
    // comes back online or to the foreground.
    const wake = () => {
      if (document.visibilityState === 'visible') void this.sync();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    void this.sync();
    return () => {
      unsubscribe();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      this.stop();
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
