import { useEffect, useState } from 'react';
import { NoteStoreProvider } from './state/context';
import { createNoteStore, type NoteStore } from './state/noteStore';
import { LocalDb } from './sync/localDb';
import { Outbox } from './sync/outbox';
import { NoteView } from './ui/NoteView';

// Shown when no Supabase project is configured: the note runs on this device
// only, with no sign-in and no sync, so the UI can be tried without a backend.
let loading: Promise<NoteStore> | null = null;

function loadPreviewStore(): Promise<NoteStore> {
  // One store per page, also when React StrictMode runs the effect twice.
  loading ??= (async () => {
    const db = new LocalDb('storenotes-preview');
    const store = createNoteStore({ db, outbox: new Outbox(db) });
    await store.getState().load('preview');
    if (store.getState().sections.length === 0) {
      const id = store.getState().addSection('Grocery List');
      store.getState().setStoreSort(id, true);
    }
    return store;
  })();
  return loading;
}

export function Preview() {
  const [store, setStore] = useState<NoteStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPreviewStore().then((loaded) => {
      if (!cancelled) setStore(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!store) return null;
  return (
    <NoteStoreProvider value={store}>
      <NoteView />
    </NoteStoreProvider>
  );
}
