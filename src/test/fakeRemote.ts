import type { Mutation, TableName } from '../sync/localDb';
import type { Remote, RemoteResult, Row, Snapshot } from '../sync/syncEngine';

// An in-memory stand-in for Supabase. Like Realtime, it echoes every accepted
// change to all subscribers, including the sender.
export class FakeRemote implements Remote {
  rows: Record<TableName, Map<string, Row>> = {
    sections: new Map(),
    items: new Map(),
    store_orders: new Map(),
  };
  mode: 'ok' | 'transient' | 'permanent' = 'ok';
  offline = false;
  gate: Promise<void> | null = null;
  sent: Mutation[] = [];
  private listeners = new Set<(table: TableName, row: Row) => void>();

  async send(m: Mutation): Promise<RemoteResult> {
    if (this.gate) await this.gate;
    if (this.mode !== 'ok') return { ok: false, permanent: this.mode === 'permanent' };
    this.sent.push(m);
    const table = this.rows[m.table];
    const current = table.get(m.id);
    if (m.kind === 'insert') {
      if (!current) table.set(m.id, { ...m.values });
    } else if (m.kind === 'upsert') {
      table.set(m.id, { ...m.values });
    } else if (current) {
      const next = { ...current, ...m.values };
      if (current.deleted_at) next.deleted_at = current.deleted_at;
      table.set(m.id, next);
    }
    const row = table.get(m.id);
    if (row) for (const listener of this.listeners) listener(m.table, { ...row });
    return { ok: true };
  }

  async fetchAll(): Promise<Snapshot | null> {
    if (this.offline) return null;
    const live = (table: TableName) =>
      [...this.rows[table].values()].filter((row) => !row.deleted_at).map((row) => ({ ...row }));
    return {
      sections: live('sections'),
      items: live('items'),
      store_orders: live('store_orders'),
    } as unknown as Snapshot;
  }

  subscribe(_listId: string, onRow: (table: TableName, row: Row) => void): () => void {
    this.listeners.add(onRow);
    return () => this.listeners.delete(onRow);
  }
}
