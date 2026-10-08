import type { LocalDb, Mutation } from './localDb';

export class Outbox {
  private inFlight: number | null = null;

  constructor(private db: LocalDb) {}

  async enqueue(m: Omit<Mutation, 'seq'>): Promise<void> {
    const last = await this.db.outbox.orderBy('seq').last();
    const mergeable =
      last !== undefined &&
      last.seq !== this.inFlight &&
      m.kind !== 'insert' &&
      last.kind === m.kind &&
      last.table === m.table &&
      last.id === m.id;
    if (mergeable) {
      await this.db.outbox.update(last.seq!, { values: { ...last.values, ...m.values } });
      return;
    }
    await this.db.outbox.add({ ...m });
  }

  async next(): Promise<Mutation | undefined> {
    const first = await this.db.outbox.orderBy('seq').first();
    this.inFlight = first?.seq ?? null;
    return first;
  }

  async done(seq: number): Promise<void> {
    await this.db.outbox.delete(seq);
    if (this.inFlight === seq) this.inFlight = null;
  }

  release(): void {
    this.inFlight = null;
  }

  count(): Promise<number> {
    return this.db.outbox.count();
  }

  async pendingFields(): Promise<Map<string, Set<string>>> {
    const pending = new Map<string, Set<string>>();
    for (const m of await this.db.outbox.toArray()) {
      const key = `${m.table}:${m.id}`;
      const fields = pending.get(key) ?? new Set<string>();
      for (const field of Object.keys(m.values)) fields.add(field);
      pending.set(key, fields);
    }
    return pending;
  }
}
