import { create } from 'zustand';
import type { Hold } from '../domain/sort';
import { readSetting, writeSetting } from './deviceSettings';

// Several lines selected at once (mouse and keyboard only). `anchor` is where
// the selection started and `cursor` the end that Shift+arrow moves.
export type Selection = { sectionId: string; ids: string[]; anchor: string; cursor: string };

function readIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readSetting(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

type UiState = {
  focusId: string | null;
  hold: Hold | null;
  storeId: string | null;
  quickAddSectionId: string | null;
  selection: Selection | null;
  hiddenStoreHints: string[]; // lists that hide the store text beside their menu, per device
  requestFocus(id: string | null): void;
  setHold(hold: Hold | null): void;
  setStoreId(id: string | null): void;
  setQuickAddSectionId(id: string | null): void;
  setSelection(selection: Selection | null): void;
  toggleStoreHint(sectionId: string): void;
};

export const useUi = create<UiState>()((set) => ({
  focusId: null,
  hold: null,
  storeId: readSetting('storeId'),
  quickAddSectionId: readSetting('quickAddSectionId'),
  selection: null,
  hiddenStoreHints: readIds('hiddenStoreHints'),
  requestFocus: (focusId) => set({ focusId }),
  setHold: (hold) => set({ hold }),
  setSelection: (selection) => set({ selection }),
  toggleStoreHint: (sectionId) =>
    set((state) => {
      const hiddenStoreHints = state.hiddenStoreHints.includes(sectionId)
        ? state.hiddenStoreHints.filter((id) => id !== sectionId)
        : [...state.hiddenStoreHints, sectionId];
      writeSetting('hiddenStoreHints', JSON.stringify(hiddenStoreHints));
      return { hiddenStoreHints };
    }),
  setStoreId: (storeId) => {
    writeSetting('storeId', storeId);
    set({ storeId });
  },
  setQuickAddSectionId: (quickAddSectionId) => {
    writeSetting('quickAddSectionId', quickAddSectionId);
    set({ quickAddSectionId });
  },
}));
