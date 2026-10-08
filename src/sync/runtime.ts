import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../domain/categories';
import { readSetting, writeSetting } from '../state/deviceSettings';
import { createNoteStore, type NoteStore } from '../state/noteStore';
import { showNotice, useSyncStatus } from '../state/syncStatus';
import type { Invite } from '../ui/InviteBanner';
import type { Person } from '../ui/SettingsSheet';
import { Categorizer } from './categorizer';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';
import { supabaseRemote } from './supabaseRemote';
import { SyncEngine } from './syncEngine';

export type Runtime = {
  store: NoteStore;
  listId: string;
  stop(): void;
  signOut(): Promise<void>;
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
  loadInvites(): Promise<Invite[]>;
  acceptInvite(listId: string): Promise<void>;
  declineInvite(listId: string): Promise<boolean>;
};

export async function startRuntime(sb: SupabaseClient): Promise<Runtime> {
  const db = new LocalDb();
  const outbox = new Outbox(db);

  // The list id is cached so later starts need no network.
  let listId = readSetting('listId');
  if (!listId) {
    const { data, error } = await sb.rpc('bootstrap');
    if (error || typeof data !== 'string') throw new Error('Could not set up the list');
    listId = data;
    writeSetting('listId', listId);
  }
  const id = listId;

  const refreshPending = () =>
    void outbox.count().then((pending) => useSyncStatus.setState({ pending }));

  let engine: SyncEngine | null = null;
  let categorizer: Categorizer | null = null;

  const store = createNoteStore({
    db,
    outbox,
    onLocalWrite: () => {
      refreshPending();
      // Send the change first so the item exists remotely, then tag it.
      void engine?.flush().then(() => categorizer?.run());
    },
  });
  await store.getState().load(id);

  categorizer = new Categorizer(async (texts) => {
    const { data, error } = await sb.functions.invoke('categorize', { body: { texts } });
    if (error) throw error;
    return (data as { categories: Record<string, Category> }).categories;
  }, store);

  engine = new SyncEngine(db, outbox, supabaseRemote(sb), id, {
    // Changes from the other device can include untagged items.
    onChange: () => void store.getState().reload().then(() => categorizer?.run()),
    onRejected: () => showNotice('A change could not be saved.'),
    onStatus: (pending) => useSyncStatus.setState({ pending }),
  });
  const stopEngine = engine.start();

  const setOnline = () => useSyncStatus.setState({ online: navigator.onLine });
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  setOnline();
  refreshPending();

  const stop = () => {
    stopEngine();
    window.removeEventListener('online', setOnline);
    window.removeEventListener('offline', setOnline);
  };

  return {
    store,
    listId: id,
    stop,
    signOut: async () => {
      stop();
      await db.delete();
      writeSetting('listId', null);
      // This device only. The default would end every session of the account,
      // signing out the other phone when both use the same login.
      await sb.auth.signOut({ scope: 'local' });
    },
    loadPeople: async () => {
      const { data } = await sb.rpc('list_people', { l: id });
      return (data ?? []) as Person[];
    },
    invite: async (email) => {
      const { error } = await sb
        .from('list_invites')
        .upsert({ list_id: id, email }, { onConflict: 'list_id,email', ignoreDuplicates: true });
      return !error;
    },
    loadInvites: async () => {
      const { data, error } = await sb.rpc('my_invites');
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
    // Only ever called from the Join button. Switches this device to the
    // shared list: send what is still queued, join, then start over from the
    // server copy of the new list.
    acceptInvite: async (target) => {
      await engine?.flush();
      const { error } = await sb.rpc('accept_invite', { l: target });
      if (error) {
        showNotice('Could not join the list. Check your connection and try again.');
        return;
      }
      stop();
      await db.delete();
      writeSetting('listId', target);
      window.location.reload();
    },
    declineInvite: async (target) => {
      const { error } = await sb.rpc('decline_invite', { l: target });
      return !error;
    },
  };
}
