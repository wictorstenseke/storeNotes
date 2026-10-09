import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../domain/categories';
import { sectionStoreId } from '../domain/sectionStore';
import { readSetting, writeSetting } from '../state/deviceSettings';
import { createNoteStore, type NoteStore } from '../state/noteStore';
import { showNotice, useSyncStatus } from '../state/syncStatus';
import { useUi } from '../state/uiStore';
import type { Invite } from '../ui/InviteBanner';
import type { Person } from '../ui/SettingsSheet';
import { Categorizer } from './categorizer';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';
import { supabaseRemote } from './supabaseRemote';
import { SyncEngine } from './syncEngine';
import { moveSectionsTo } from './transfer';

export type Runtime = {
  store: NoteStore;
  listId: string;
  stop(): void;
  signOut(): Promise<void>;
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
  loadInvites(): Promise<Invite[]>;
  acceptInvite(listId: string, keep: string[]): Promise<void>;
  declineInvite(listId: string): Promise<boolean>;
};

export async function startRuntime(sb: SupabaseClient): Promise<Runtime> {
  const db = new LocalDb();
  const outbox = new Outbox(db);

  // The list id is cached so later starts need no network.
  let listId = readSetting('listId');
  if (!listId) {
    const { data, error } = await sb.rpc('bootstrap');
    if (error || typeof data !== 'string') throw new Error('Kunde inte skapa listan');
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

  categorizer = new Categorizer(
    async (texts) => {
      const { data, error } = await sb.functions.invoke('categorize', { body: { texts } });
      if (error) throw error;
      return (data as { categories: Record<string, Category> }).categories;
    },
    store,
    (section) =>
      sectionStoreId(section, useUi.getState().sectionStores, useUi.getState().fallbackStoreId) !==
      null,
  );
  // Choosing a store for a list on this device is what makes its items need categories.
  const stopStores = useUi.subscribe((state, prev) => {
    if (state.sectionStores !== prev.sectionStores) void categorizer?.run();
  });

  engine = new SyncEngine(db, outbox, supabaseRemote(sb), id, {
    // Changes from the other device can include untagged items.
    onChange: () =>
      void store
        .getState()
        .reload()
        .then(() => categorizer?.run()),
    onRejected: () => showNotice('En ändring kunde inte sparas.'),
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
    stopStores();
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
    // shared list: send what is still queued, join, move the chosen
    // sections over, then start over from the server copy of the new list.
    acceptInvite: async (target, keep) => {
      await engine?.flush();
      const { error } = await sb.rpc('accept_invite', { l: target });
      if (error) {
        showNotice('Kunde inte gå med i listan. Kontrollera anslutningen och försök igen.');
        return;
      }
      stop();
      // Take the chosen sections along. They are queued for sending, so a
      // bad connection only delays them. If the last position cannot be read
      // they are added anyway; equal positions are sorted by id.
      let last: string | null = null;
      try {
        const { data } = await sb
          .from('sections')
          .select('position')
          .eq('list_id', target)
          .is('deleted_at', null)
          .order('position', { ascending: false })
          .limit(1);
        last = (data?.[0] as { position: string } | undefined)?.position ?? null;
      } catch {
        // keep null
      }
      await moveSectionsTo(db, outbox, id, target, keep, last);
      writeSetting('listId', target);
      window.location.reload();
    },
    declineInvite: async (target) => {
      const { error } = await sb.rpc('decline_invite', { l: target });
      return !error;
    },
  };
}
