import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { NoteActions, NoteState, NoteStore } from './noteStore';

const NoteStoreContext = createContext<NoteStore | null>(null);

export const NoteStoreProvider = NoteStoreContext.Provider;

export function useNoteStore(): NoteStore {
  const store = useContext(NoteStoreContext);
  if (!store) throw new Error('NoteStoreProvider is missing');
  return store;
}

// Selectors must return a value held in the store (not a new array or object),
// or the component re-renders forever. Derive lists with useMemo instead.
export function useNote<T>(selector: (state: NoteState & NoteActions) => T): T {
  return useStore(useNoteStore(), selector);
}
