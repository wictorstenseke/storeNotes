import type { SupabaseClient } from '@supabase/supabase-js';
import type { Item, Section, StoreOrder } from '../domain/types';
import type { Remote, RemoteResult, Row } from './syncEngine';

const RETRY_STATUSES = [401, 408, 429];

function toResult(error: unknown, status: number): RemoteResult {
  if (!error) return { ok: true };
  const permanent = status >= 400 && status < 500 && !RETRY_STATUSES.includes(status);
  return { ok: false, permanent };
}

export function supabaseRemote(sb: SupabaseClient): Remote {
  // Without a session supabase-js would send the request as an anonymous
  // visitor. Never do that: a patch would "succeed" on no rows and a fetch
  // would come back empty, and the caller would drop edits or wipe the list.
  const hasSession = async (): Promise<boolean> => {
    try {
      const { data } = await sb.auth.getSession();
      return Boolean(data.session);
    } catch {
      return false;
    }
  };

  return {
    async send(m) {
      try {
        if (!(await hasSession())) return { ok: false, permanent: false };
        if (m.kind === 'patch') {
          const { data, error, status } = await sb
            .from(m.table)
            .update(m.values)
            .eq('id', m.id)
            .select('id');
          const result = toResult(error, status);
          // The row always exists (deletes are soft), so changing no row means
          // the access rules hid it: this account can no longer write here.
          if (result.ok && (data ?? []).length === 0) return { ok: false, permanent: true };
          return result;
        }
        if (m.kind === 'insert') {
          const { error, status } = await sb
            .from(m.table)
            .upsert(m.values, { onConflict: 'id', ignoreDuplicates: true });
          return toResult(error, status);
        }
        const { error, status } = await sb
          .from(m.table)
          .upsert(m.values, { onConflict: 'list_id,store_id' });
        return toResult(error, status);
      } catch {
        return { ok: false, permanent: false };
      }
    },

    async fetchAll(listId) {
      try {
        if (!(await hasSession())) return null;
        const [sections, items, orders] = await Promise.all([
          sb.from('sections').select('*').eq('list_id', listId).is('deleted_at', null),
          sb.from('items').select('*').eq('list_id', listId).is('deleted_at', null),
          sb.from('store_orders').select('*').eq('list_id', listId),
        ]);
        if (sections.error || items.error || orders.error) return null;
        return {
          sections: sections.data as Section[],
          items: items.data as Item[],
          store_orders: orders.data as StoreOrder[],
        };
      } catch {
        return null;
      }
    },

    subscribe(listId, onRow, onRejoin) {
      const channel = sb.channel(`list:${listId}`);
      for (const table of ['sections', 'items', 'store_orders'] as const) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `list_id=eq.${listId}` },
          (payload) => {
            if (payload.eventType !== 'DELETE') onRow(table, payload.new as Row);
          },
        );
      }
      let joinedBefore = false;
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (joinedBefore) onRejoin();
        joinedBefore = true;
      });
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
