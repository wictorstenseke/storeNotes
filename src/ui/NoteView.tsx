import { useMemo, type ReactNode } from 'react';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { SectionView } from './SectionView';

export function NoteView({ header }: { header?: ReactNode }) {
  const store = useNoteStore();
  const sections = useNote((s) => s.sections);
  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);

  const addSection = () => {
    const id = store.getState().addSection();
    useUi.getState().requestFocus(id);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col pb-28 pt-[env(safe-area-inset-top)]">
      <header className="flex h-11 items-center justify-end gap-3 px-4">{header}</header>
      {sorted.map((section) => (
        <SectionView key={section.id} section={section} />
      ))}
      <button
        type="button"
        className="mx-4 mt-6 self-start text-[14px] text-notes-ink"
        onClick={addSection}
      >
        + New section
      </button>
    </main>
  );
}
