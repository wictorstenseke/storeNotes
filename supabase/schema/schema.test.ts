// @vitest-environment node
//
// Runs the migration in an in-process Postgres (PGlite) with a small stand-in
// for Supabase's auth schema and roles, so the access rules can be tested
// without Docker. supabase/tests/access.test.ts covers the same rules against
// a real local Supabase stack.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_STANDIN = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  create publication supabase_realtime;
`;

type Person = { id: string; email: string };

let db: PGlite;
let anna: Person;
let bo: Person;
let cy: Person;
let listId: string;
let sectionId: string;

async function person(email: string): Promise<Person> {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return { id, email };
}

// Run one statement the way Supabase runs a signed-in request.
async function as<T = Record<string, unknown>>(who: Person, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who.id]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email: who.email })]);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const bootstrap = async (who: Person) =>
  (await as<{ id: string }>(who, 'select public.bootstrap() as id'))[0].id;

const addItem = (who: Person, text: string, id = crypto.randomUUID()) =>
  as(who, `insert into public.items (id, list_id, section_id, text, position) values ($1, $2, $3, $4, 'a0')`, [
    id,
    listId,
    sectionId,
    text,
  ]).then(() => id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  anna = await person('anna@example.test');
  bo = await person('bo@example.test');
  cy = await person('cy@example.test');
  listId = await bootstrap(anna);
  sectionId = (await as<{ id: string }>(anna, 'select id from public.sections where list_id = $1', [listId]))[0].id;
}, 60000);

describe('bootstrap', () => {
  it('creates one list with a Grocery List section and returns it every time', async () => {
    const sections = await as(anna, 'select title, store_sort, position from public.sections where list_id = $1', [listId]);
    expect(sections).toEqual([{ title: 'Grocery List', store_sort: true, position: 'a0' }]);
    expect(await bootstrap(anna)).toBe(listId);
    expect(await as(anna, 'select id from public.lists')).toHaveLength(1);
  });
});

describe('access rules', () => {
  it('lets a member write and read items', async () => {
    await addItem(anna, 'Milk');
    expect(await as(anna, 'select text from public.items where list_id = $1', [listId])).toEqual([{ text: 'Milk' }]);
  });

  it('hides the list from a non-member and refuses their writes', async () => {
    expect(await as(cy, 'select id from public.items where list_id = $1', [listId])).toEqual([]);
    expect(await as(cy, 'select id from public.lists')).toEqual([]);
    await expect(addItem(cy, 'Sneaky')).rejects.toThrow(/row-level security/);
    expect(await as(cy, `update public.items set text = 'Changed' where list_id = $1 returning id`, [listId])).toEqual([]);
  });

  it('gives an invited person the shared list when they sign in', async () => {
    await as(anna, 'insert into public.list_invites (list_id, email) values ($1, $2)', [listId, bo.email]);
    expect(await bootstrap(bo)).toBe(listId);
    expect(await as(bo, 'select text from public.items where list_id = $1', [listId])).toEqual([{ text: 'Milk' }]);
    expect(await as(anna, 'select email from public.list_invites where list_id = $1', [listId])).toEqual([]);
  });

  it('prefers a shared list over one the person created earlier', async () => {
    const dana = await person('dana@example.test');
    const own = await bootstrap(dana);
    expect(own).not.toBe(listId);
    await as(anna, 'insert into public.list_invites (list_id, email) values ($1, $2)', [listId, dana.email]);
    expect(await bootstrap(dana)).toBe(listId);
  });

  it('does not let an uninvited person join', async () => {
    await as(cy, 'select public.accept_invites()');
    expect(await bootstrap(cy)).not.toBe(listId);
    expect(await as(cy, 'select id from public.items where list_id = $1', [listId])).toEqual([]);
  });

  it('refuses an invite that is not lower-case', async () => {
    await expect(
      as(anna, 'insert into public.list_invites (list_id, email) values ($1, $2)', [listId, 'Mixed@Example.test']),
    ).rejects.toThrow(/check constraint/);
  });

  it('lists members and pending invites to members only', async () => {
    await as(anna, 'insert into public.list_invites (list_id, email) values ($1, $2)', [listId, 'pending@example.test']);
    const people = await as(anna, 'select email, pending from public.list_people($1)', [listId]);
    expect(people).toEqual(
      expect.arrayContaining([
        { email: anna.email, pending: false },
        { email: bo.email, pending: false },
        { email: 'pending@example.test', pending: true },
      ]),
    );
    expect(await as(cy, 'select email, pending from public.list_people($1)', [listId])).toEqual([]);
  });

  it('keeps the category cache away from clients', async () => {
    await db.query(`insert into public.category_cache (text_key, category) values ('secret', 'dairy')`);
    await expect(as(anna, 'select * from public.category_cache')).rejects.toThrow(/permission denied/);
    await expect(
      as(anna, `insert into public.category_cache (text_key, category) values ('x', 'dairy')`),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuses everything to a request that is not signed in', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select id from public.items')).rejects.toThrow(/permission denied/);
      await expect(db.query('select public.bootstrap()')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('row rules', () => {
  it('keeps a deleted item deleted', async () => {
    const id = await addItem(anna, 'Temp');
    await as(anna, 'update public.items set deleted_at = now() where id = $1', [id]);
    await as(anna, `update public.items set deleted_at = null, text = 'Back' where id = $1`, [id]);
    const [row] = await as<{ text: string; deleted_at: unknown }>(anna, 'select text, deleted_at from public.items where id = $1', [id]);
    expect(row.text).toBe('Back');
    expect(row.deleted_at).not.toBeNull();
  });

  it('sets updated_at on every write, whatever the client sends', async () => {
    const id = crypto.randomUUID();
    await as(
      anna,
      `insert into public.items (id, list_id, section_id, text, position, updated_at) values ($1, $2, $3, 'Stamp', 'a0', '2000-01-01')`,
      [id, listId, sectionId],
    );
    const [row] = await as<{ updated_at: Date }>(anna, 'select updated_at from public.items where id = $1', [id]);
    expect(new Date(row.updated_at).getFullYear()).toBeGreaterThan(2000);
  });

  it('ignores a repeated insert of the same row', async () => {
    const id = await addItem(anna, 'Once');
    await as(anna, `update public.items set text = 'Edited' where id = $1`, [id]);
    await as(
      anna,
      `insert into public.items (id, list_id, section_id, text, position) values ($1, $2, $3, 'Once', 'a0') on conflict (id) do nothing`,
      [id, listId, sectionId],
    );
    expect(await as(anna, 'select text from public.items where id = $1', [id])).toEqual([{ text: 'Edited' }]);
  });

  it('publishes the synced tables to Realtime', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(['items', 'sections', 'store_orders']);
  });
});
