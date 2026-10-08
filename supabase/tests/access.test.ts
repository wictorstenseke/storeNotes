import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.API_URL!;
const anonKey = (process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY)!;
const serviceKey = (process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY)!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, noSession);
const run = Date.now();
const PASSWORD = 'test-password-123';

type Person = { client: SupabaseClient; email: string };

async function signedIn(name: string): Promise<Person> {
  const email = `${name}-${run}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, email };
}

async function bootstrap(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc('bootstrap');
  if (error) throw error;
  return data as string;
}

const newItem = (listId: string, sectionId: string, text: string) => ({
  id: crypto.randomUUID(),
  list_id: listId,
  section_id: sectionId,
  text,
  position: 'a0',
});

let anna: Person;
let bo: Person;
let cy: Person;
let listId: string;
let sectionId: string;

beforeAll(async () => {
  anna = await signedIn('anna');
  bo = await signedIn('bo');
  cy = await signedIn('cy');
  listId = await bootstrap(anna.client);
  const { data } = await anna.client.from('sections').select('id').eq('list_id', listId);
  sectionId = data![0].id;
});

describe('bootstrap', () => {
  it('creates one list with a Grocery List section and returns it every time', async () => {
    const { data } = await anna.client.from('sections').select('title, store_sort').eq('list_id', listId);
    expect(data).toEqual([{ title: 'Grocery List', store_sort: true }]);
    expect(await bootstrap(anna.client)).toBe(listId);
  });
});

describe('access rules', () => {
  it('lets a member write and read items', async () => {
    const write = await anna.client.from('items').insert(newItem(listId, sectionId, 'Milk'));
    expect(write.error).toBeNull();
    const read = await anna.client.from('items').select('text').eq('list_id', listId);
    expect(read.data).toEqual([{ text: 'Milk' }]);
  });

  it('hides the list from a non-member and refuses their writes', async () => {
    const read = await cy.client.from('items').select('id').eq('list_id', listId);
    expect(read.data).toEqual([]);
    const write = await cy.client.from('items').insert(newItem(listId, sectionId, 'Sneaky'));
    expect(write.error).not.toBeNull();
    const patch = await cy.client.from('items').update({ text: 'Changed' }).eq('list_id', listId).select();
    expect(patch.data).toEqual([]);
  });

  it('shows an invited person the invite and moves them only when they accept', async () => {
    const invite = await anna.client.from('list_invites').insert({ list_id: listId, email: bo.email });
    expect(invite.error).toBeNull();
    expect(await bootstrap(bo.client)).not.toBe(listId);
    const invites = await bo.client.rpc('my_invites');
    expect(invites.data).toEqual([{ list_id: listId, invited_by: anna.email }]);

    const accepted = await bo.client.rpc('accept_invite', { l: listId });
    expect(accepted.error).toBeNull();
    expect(await bootstrap(bo.client)).toBe(listId);
    const read = await bo.client.from('items').select('text').eq('list_id', listId);
    expect(read.data).toEqual([{ text: 'Milk' }]);
    const left = await anna.client.from('list_invites').select('email').eq('list_id', listId);
    expect(left.data).toEqual([]);
  });

  it('does not move anyone to a stranger\'s list because the stranger invited them', async () => {
    const strangerList = await bootstrap(cy.client);
    await cy.client.from('list_invites').insert({ list_id: strangerList, email: anna.email });
    expect(await bootstrap(anna.client)).toBe(listId);
    await anna.client.rpc('decline_invite', { l: strangerList });
    expect((await anna.client.rpc('my_invites')).data).toEqual([]);
  });

  it('does not let an uninvited person join', async () => {
    const attempt = await cy.client.rpc('accept_invite', { l: listId });
    expect(attempt.error).not.toBeNull();
    expect(await bootstrap(cy.client)).not.toBe(listId);
    const read = await cy.client.from('items').select('id').eq('list_id', listId);
    expect(read.data).toEqual([]);
  });

  it('answers a request with no session with an error, not an empty result', async () => {
    const anonymous = createClient(url, anonKey, noSession);
    const read = await anonymous.from('items').select('id');
    expect(read.error).not.toBeNull();
    const write = await anonymous.from('items').update({ text: 'x' }).eq('list_id', listId).select('id');
    expect(write.error).not.toBeNull();
    expect((await anonymous.rpc('bootstrap')).error).not.toBeNull();
  });

  it('lists members and pending invites to members only', async () => {
    const pendingEmail = `pending-${run}@example.test`;
    await anna.client.from('list_invites').insert({ list_id: listId, email: pendingEmail });
    const { data } = await anna.client.rpc('list_people', { l: listId });
    expect(data).toHaveLength(3);
    expect(data).toEqual(
      expect.arrayContaining([
        { email: anna.email, pending: false },
        { email: bo.email, pending: false },
        { email: pendingEmail, pending: true },
      ]),
    );
    const outsider = await cy.client.rpc('list_people', { l: listId });
    expect(outsider.data).toEqual([]);
  });

  it('keeps the category cache away from clients', async () => {
    await admin.from('category_cache').upsert({ text_key: `secret-${run}`, category: 'dairy' });
    const read = await anna.client.from('category_cache').select('*');
    expect(read.data ?? []).toEqual([]);
    const write = await anna.client.from('category_cache').insert({ text_key: `x-${run}`, category: 'dairy' });
    expect(write.error).not.toBeNull();
  });
});

describe('row rules', () => {
  it('keeps a deleted item deleted', async () => {
    const row = newItem(listId, sectionId, 'Temp');
    await anna.client.from('items').insert(row);
    await anna.client.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', row.id);
    await anna.client.from('items').update({ deleted_at: null, text: 'Back' }).eq('id', row.id);
    const { data } = await anna.client.from('items').select('text, deleted_at').eq('id', row.id);
    expect(data![0].text).toBe('Back');
    expect(data![0].deleted_at).not.toBeNull();
  });

  it('sets updated_at on every write, whatever the client sends', async () => {
    const row = { ...newItem(listId, sectionId, 'Stamp'), updated_at: '2000-01-01T00:00:00Z' };
    await anna.client.from('items').insert(row);
    const { data } = await anna.client.from('items').select('updated_at').eq('id', row.id);
    expect(new Date(data![0].updated_at).getFullYear()).toBeGreaterThan(2000);
  });

  it('ignores a repeated insert of the same row', async () => {
    const row = newItem(listId, sectionId, 'Once');
    await anna.client.from('items').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    await anna.client.from('items').update({ text: 'Edited' }).eq('id', row.id);
    const again = await anna.client.from('items').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    expect(again.error).toBeNull();
    const { data } = await anna.client.from('items').select('text').eq('id', row.id);
    expect(data![0].text).toBe('Edited');
  });
});
