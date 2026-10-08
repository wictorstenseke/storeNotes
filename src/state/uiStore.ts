import { create } from 'zustand';
import type { Hold } from '../domain/sort';
import { readSetting, writeSetting } from './deviceSettings';

// Several lines selected at once (mouse and keyboard only). `anchor` is where
// the selection started and `cursor` the end that Shift+arrow moves.
export type Selection = { sectionId: string; ids: string[]; anchor: string; cursor: string };

type UiState = {
  focusId: string | null;
  hold: Hold | null;
  storeId: string | null;
  quickAddSectionId: string | null;
  selection: Selection | null;
  orderEditorStore: string | null; // the store whose order is being edited, if any
  requestFocus(id: string | null): void;
  setHold(hold: Hold | null): void;
  setStoreId(id: string | null): void;
  setQuickAddSectionId(id: string | null): void;
  setSelection(selection: Selection | null): void;
  setOrderEditorStore(id: string | null): void;
};

export const useUi = create<UiState>()((set) => ({
  focusId: null,
  hold: null,
  storeId: readSetting('storeId'),
  quickAddSectionId: readSetting('quickAddSectionId'),
  selection: null,
  orderEditorStore: null,
  requestFocus: (focusId) => set({ focusId }),
  setHold: (hold) => set({ hold }),
  setSelection: (selection) => set({ selection }),
  setOrderEditorStore: (orderEditorStore) => set({ orderEditorStore }),
  setStoreId: (storeId) => {
    writeSetting('storeId', storeId);
    set({ storeId });
  },
  setQuickAddSectionId: (quickAddSectionId) => {
    writeSetting('quickAddSectionId', quickAddSectionId);
    set({ quickAddSectionId });
  },
}));
