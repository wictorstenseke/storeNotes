import { create } from 'zustand';
import type { Hold } from '../domain/sort';
import { readSetting, writeSetting } from './deviceSettings';

type UiState = {
  focusId: string | null;
  hold: Hold | null;
  storeId: string | null;
  quickAddSectionId: string | null;
  requestFocus(id: string | null): void;
  setHold(hold: Hold | null): void;
  setStoreId(id: string | null): void;
  setQuickAddSectionId(id: string | null): void;
};

export const useUi = create<UiState>()((set) => ({
  focusId: null,
  hold: null,
  storeId: readSetting('storeId'),
  quickAddSectionId: readSetting('quickAddSectionId'),
  requestFocus: (focusId) => set({ focusId }),
  setHold: (hold) => set({ hold }),
  setStoreId: (storeId) => {
    writeSetting('storeId', storeId);
    set({ storeId });
  },
  setQuickAddSectionId: (quickAddSectionId) => {
    writeSetting('quickAddSectionId', quickAddSectionId);
    set({ quickAddSectionId });
  },
}));
