import Dexie, { type Table } from 'dexie';
import type { Item, Section, StoreOrder } from '../domain/types';

export type TableName = 'sections' | 'items' | 'store_orders';

export type Mutation = {
  seq?: number;
  table: TableName;
  kind: 'insert' | 'patch' | 'upsert';
  id: string;
  values: Record<string, unknown>;
};

export class LocalDb extends Dexie {
  sections!: Table<Section, string>;
  items!: Table<Item, string>;
  store_orders!: Table<StoreOrder, [string, string]>;
  outbox!: Table<Mutation, number>;

  constructor(name = 'storenotes') {
    super(name);
    this.version(1).stores({
      sections: 'id',
      items: 'id',
      store_orders: '[list_id+store_id]',
      outbox: '++seq',
    });
  }
}
