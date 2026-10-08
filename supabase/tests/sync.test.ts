// End-to-end sync against a real Supabase project: the real note store, outbox,
// sync engine and Supabase remote, with two signed-in people on two "devices".
import 'fake-indexeddb/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNoteStore } from '../../src/state/noteStore';
import { LocalDb } from '../../src/sync/localDb';
import { Outbox } from '../../src/sync/outbox';
import { supabaseRemote } from '../../src/sync/supabaseRemote';
import { SyncEngine } from '../../src/sync/syncEngine';

const url = process.env.API_URL!;
const anonKey = (process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY)!;
const serviceKey = (process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY)!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, noSession);
const run = Date.now();
const PASSWORD = `pw-${crypto.randomUUID()}`;
const createdUserIds: string[] = [];
const cleanups: (() => void)[] = [];

async function signedIn(name: string): Promise<{ client: SupabaseClient; email: string }> {
  const email = `sync-${name}-${run}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  createdUserIds.push(created.data.user.id);
  const client = createClient(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, email };
}

async function device(client: SupabaseClient, listId: string) {
  const db = new LocalDb(`sync-${Math.random()}`);
  const outbox = new Outbox(db);
  const store = createNoteStore({ db, outbox });
  await store.getState().load(listId);
  const rejected: number[] = [];
  const remote = supabaseRemote(client);
  const engine = new SyncEngine(db, outbox, remote, listId, {
    onChange: () => void store.getState().reload(),
    onRejected: () => rejected.push(1),
  });
  cleanups.push(() => engine.stop());
  const s = () => store.getState();
  const push = async () => {
    await s().idle();
    await engine.flush();
  };
  const pull = async () => {
    await engine.refetch();
    await s().reload();
  };
  return { db, outbox, store, engine, remote, rejected, s, push, pull };
}

async function until(check: () => boolean, ms = 15000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

let anna: Awaited<ReturnType<typeof signedIn>>;
let bo: Awaited<ReturnType<typeof signedIn>>;
let cy: Awaited<ReturnType<typeof signedIn>>;
let listId: string;

beforeAll(async () => {
  [anna, bo, cy] = await Promise.all([signedIn('anna'), signedIn('bo'), signedIn('cy')]);
  listId = (await anna.client.rpc('bootstrap')).data as string;
  await bo.client.rpc('bootstrap');
  await anna.client.from('list_invites').insert({ list_id: listId, email: bo.email });
  const accepted = await bo.client.rpc('accept_invite', { l: listId });
  if (accepted.error) throw accepted.error;
}, 60000);

afterAll(async () => {
  for (const cleanup of cleanups) cleanup();
  await Promise.all([anna, bo, cy].map((person) => person?.client.removeAllChannels()));
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe('sync against Supabase', () => {
  it('sends local changes and another device fetches them', async () => {
    const a = await device(anna.client, listId);
    await a.pull();
    expect(a.s().sections.map((x) => x.title)).toEqual(['Grocery List']);
    const section = a.s().sections[0].id;

    const milk = a.s().addItem(section, 'Mjölk');
    a.s().checkItem(milk, 'willys');
    await a.push();
    expect(await a.outbox.count()).toBe(0);
    expect(a.rejected).toEqual([]);

    const b = await device(bo.client, listId);
    await b.pull();
    expect(b.s().items.map((i) => [i.text, i.checked, i.checked_store])).toEqual([['Mjölk', true, 'willys']]);
  });

  it('delivers a change to the other device over Realtime', async () => {
    const a = await device(anna.client, listId);
    const b = await device(bo.client, listId);
    await a.pull();
    await b.pull();
    const unsubscribe = b.remote.subscribe(
      listId,
      (table, row) => void b.engine.applyRemote(table, row),
      () => {},
    );
    cleanups.push(unsubscribe);
    await new Promise((resolve) => setTimeout(resolve, 4000)); // let the channel join

    const section = a.s().sections[0].id;
    a.s().addItem(section, 'Kaffe');
    await a.push();
    await until(() => b.s().items.some((i) => i.text === 'Kaffe'));

    const kaffe = b.s().items.find((i) => i.text === 'Kaffe')!;
    expect(kaffe.checked).toBe(false);
  });

  it('merges different fields changed on two devices', async () => {
    const a = await device(anna.client, listId);
    const b = await device(bo.client, listId);
    await a.pull();
    const item = a.s().addItem(a.s().sections[0].id, 'Brod');
    await a.push();
    await b.pull();

    a.s().checkItem(item, null);
    b.s().setItemText(item, 'Bröd');
    await a.push();
    await b.push();
    await a.pull();
    await b.pull();

    for (const d of [a, b]) {
      expect(d.s().items.find((i) => i.id === item)).toMatchObject({ text: 'Bröd', checked: true });
    }
  });

  it('accepts a repeated insert without duplicating or overwriting', async () => {
    const a = await device(anna.client, listId);
    await a.pull();
    const item = a.s().addItem(a.s().sections[0].id, 'Smör');
    await a.s().idle();
    const insert = (await a.db.outbox.orderBy('seq').first())!;
    await a.push();
    a.s().setItemText(item, 'Smör, osaltat');
    await a.push();

    expect(await a.remote.send(insert)).toEqual({ ok: true });
    const { data } = await anna.client.from('items').select('text').eq('id', item);
    expect(data).toEqual([{ text: 'Smör, osaltat' }]);
  });

  it('removes a cleared item for the other device', async () => {
    const a = await device(anna.client, listId);
    const b = await device(bo.client, listId);
    await a.pull();
    const section = a.s().sections[0].id;
    const item = a.s().addItem(section, 'Glass');
    a.s().checkItem(item, null);
    await a.push();
    await b.pull();
    expect(b.s().items.some((i) => i.id === item)).toBe(true);

    a.s().clearDone(section);
    await a.push();
    await b.pull();
    expect(b.s().items.some((i) => i.id === item)).toBe(false);
    expect(a.s().items.some((i) => i.checked)).toBe(false);
  });

  it('refuses a stranger: nothing fetched, a change counts as refused, the row is untouched', async () => {
    const a = await device(anna.client, listId);
    await a.pull();
    const item = a.s().addItem(a.s().sections[0].id, 'Hemligt');
    await a.push();

    const stranger = supabaseRemote(cy.client);
    expect(await stranger.fetchAll(listId)).toEqual({ sections: [], items: [], store_orders: [] });
    expect(
      await stranger.send({ table: 'items', kind: 'patch', id: item, values: { text: 'Kapad' } }),
    ).toEqual({ ok: false, permanent: true });
    const { data } = await anna.client.from('items').select('text').eq('id', item);
    expect(data).toEqual([{ text: 'Hemligt' }]);
  });

  it('does nothing without a session', async () => {
    const signedOut = supabaseRemote(createClient(url, anonKey, noSession));
    expect(await signedOut.fetchAll(listId)).toBeNull();
    expect(
      await signedOut.send({ table: 'items', kind: 'patch', id: crypto.randomUUID(), values: { text: 'x' } }),
    ).toEqual({ ok: false, permanent: false });
  });
});
