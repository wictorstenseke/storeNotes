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
  showQuickAdd: boolean; // the add-item bar at the bottom, per device
  sheetRequest: 'invite' | null; // something outside the settings sheet asking it to open on a view
  hiddenStoreHints: string[]; // lists that hide the store text beside their menu, per device
  collapsedSections: string[]; // lists folded to just their title, per device
  requestFocus(id: string | null): void;
  setHold(hold: Hold | null): void;
  setStoreId(id: string | null): void;
  setQuickAddSectionId(id: string | null): void;
  setSelection(selection: Selection | null): void;
  toggleStoreHint(sectionId: string): void;
  toggleCollapsed(sectionId: string): void;
  setShowQuickAdd(show: boolean): void;
  requestSheet(view: 'invite' | null): void;
};

export const useUi = create<UiState>()((set) => ({
  focusId: null,
  hold: null,
  storeId: readSetting('storeId'),
  quickAddSectionId: readSetting('quickAddSectionId'),
  selection: null,
  showQuickAdd: readSetting('showQuickAdd') !== 'false',
  sheetRequest: null,
  hiddenStoreHints: readIds('hiddenStoreHints'),
  collapsedSections: readIds('collapsedSections'),
  requestFocus: (focusId) => set({ focusId }),
  setHold: (hold) => set({ hold }),
  setSelection: (selection) => set({ selection }),
  requestSheet: (sheetRequest) => set({ sheetRequest }),
  setShowQuickAdd: (showQuickAdd) => {
    writeSetting('showQuickAdd', String(showQuickAdd));
    set({ showQuickAdd });
  },
  toggleCollapsed: (sectionId) =>
    set((state) => {
      const collapsedSections = state.collapsedSections.includes(sectionId)
        ? state.collapsedSections.filter((id) => id !== sectionId)
        : [...state.collapsedSections, sectionId];
      writeSetting('collapsedSections', JSON.stringify(collapsedSections));
      return { collapsedSections };
    }),
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
