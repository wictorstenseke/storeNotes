import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Mutation } from './localDb';
import { supabaseRemote } from './supabaseRemote';

type Result = { data?: unknown; error?: unknown; status?: number };

// A stand-in for the supabase-js query builder: every method returns the
// builder, and awaiting it gives the configured result.
function fakeClient(options: { session?: unknown; result?: Result } = {}) {
  const calls: string[] = [];
  const result = { data: [{ id: 'a' }], error: null, status: 200, ...options.result };
  const builder: unknown = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'then'
          ? (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
          : () => {
              calls.push(String(prop));
              return builder;
            },
    },
  );
  const session = 'session' in options ? options.session : { user: { id: 'u1' } };
  const sb = {
    auth: { getSession: async () => ({ data: { session }, error: null }) },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return builder;
    },
  };
  return { remote: supabaseRemote(sb as unknown as SupabaseClient), calls };
}

const patch: Mutation = { table: 'items', kind: 'patch', id: 'a', values: { checked: true } };
const insert: Mutation = { table: 'items', kind: 'insert', id: 'a', values: { id: 'a' } };

describe('supabaseRemote without a session', () => {
  it('keeps a change queued and sends nothing', async () => {
    const { remote, calls } = fakeClient({ session: null });
    expect(await remote.send(patch)).toEqual({ ok: false, permanent: false });
    expect(await remote.send(insert)).toEqual({ ok: false, permanent: false });
    expect(calls).toEqual([]);
  });

  it('does not fetch, so the local copy is left alone', async () => {
    const { remote, calls } = fakeClient({ session: null, result: { data: [] } });
    expect(await remote.fetchAll('list-1')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('supabaseRemote.send', () => {
  it('accepts a patch that changed a row', async () => {
    const { remote } = fakeClient();
    expect(await remote.send(patch)).toEqual({ ok: true });
  });

  it('treats a patch that changed no row as refused for good', async () => {
    const { remote } = fakeClient({ result: { data: [], status: 200 } });
    expect(await remote.send(patch)).toEqual({ ok: false, permanent: true });
  });

  it('accepts an insert', async () => {
    const { remote, calls } = fakeClient({ result: { data: null, status: 201 } });
    expect(await remote.send(insert)).toEqual({ ok: true });
    expect(calls).toContain('upsert');
  });

  it('retries when the network fails, the session expired or the server is busy', async () => {
    for (const status of [0, 401, 408, 429, 500, 503]) {
      const { remote } = fakeClient({ result: { error: { message: 'x' }, status } });
      expect(await remote.send(patch)).toEqual({ ok: false, permanent: false });
    }
  });

  it('gives up on a change the server refuses', async () => {
    for (const status of [400, 403, 409]) {
      const { remote } = fakeClient({ result: { error: { message: 'x' }, status } });
      expect(await remote.send(insert)).toEqual({ ok: false, permanent: true });
    }
  });
});

describe('supabaseRemote.fetchAll', () => {
  it('returns the three tables', async () => {
    const { remote } = fakeClient({ result: { data: [{ id: 'a' }] } });
    expect(await remote.fetchAll('list-1')).toEqual({
      sections: [{ id: 'a' }],
      items: [{ id: 'a' }],
      store_orders: [{ id: 'a' }],
    });
  });

  it('returns null when any query fails', async () => {
    const { remote } = fakeClient({ result: { error: { message: 'x' }, status: 500 } });
    expect(await remote.fetchAll('list-1')).toBeNull();
  });
});
