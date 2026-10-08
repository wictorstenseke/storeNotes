import { useEffect, useState } from 'react';
import { NoteStoreProvider } from './state/context';
import { createNoteStore, type NoteStore } from './state/noteStore';
import { LocalDb } from './sync/localDb';
import { Outbox } from './sync/outbox';
import { NoteView } from './ui/NoteView';

export function App() {
  const [store, setStore] = useState<NoteStore | null>(null);

  useEffect(() => {
    const db = new LocalDb('storenotes-preview');
    const preview = createNoteStore({ db, outbox: new Outbox(db) });
    void preview
      .getState()
      .load('preview')
      .then(() => {
        if (preview.getState().sections.length === 0) {
          const id = preview.getState().addSection('Grocery List');
          preview.getState().setStoreSort(id, true);
        }
        setStore(preview);
      });
  }, []);

  if (!store) return null;
  return (
    <NoteStoreProvider value={store}>
      <NoteView />
    </NoteStoreProvider>
  );
}
