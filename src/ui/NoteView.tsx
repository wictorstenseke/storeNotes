import { PlusIcon, ShoppingBasketIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { QuickAddBar } from './QuickAddBar';
import { useKeyboard } from './useKeyboardInset';
import { SectionView } from './SectionView';

export function NoteView({ header, banner }: { header?: ReactNode; banner?: ReactNode }) {
  const store = useNoteStore();
  const keyboard = useKeyboard();
  const showQuickAdd = useUi((s) => s.showQuickAdd);
  const sections = useNote((s) => s.sections);
  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);

  const addSection = () => {
    const id = store.getState().addSection();
    useUi.getState().requestFocus(id);
  };

  // The app fills what is visible. With the keyboard up that is the visual
  // viewport, wherever iOS has panned it, so the quick-add bar needs no
  // positioning of its own and nothing slides under the keyboard.
  const keyboardOpen = keyboard.inset > 0;

  return (
    <div
      className="fixed inset-x-0 flex flex-col"
      style={keyboardOpen ? { top: keyboard.top, height: keyboard.height } : { top: 0, bottom: 0 }}
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-xl flex-col pb-6 pt-[env(safe-area-inset-top)]">
          <header className="mt-5 flex h-11 items-center gap-3 px-5">{header}</header>
          {banner}
          {sorted.length === 0 ? (
            <Empty className="mx-5 mt-6 w-auto flex-none rounded-lg bg-field px-6 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-page">
                  <ShoppingBasketIcon />
                </EmptyMedia>
                <EmptyTitle>Inga listor än</EmptyTitle>
                <EmptyDescription>Skapa din första lista för att börja lägga till varor.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="lg" onClick={addSection}>
                  <PlusIcon data-icon="inline-start" />
                  Skapa lista
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {sorted.map((section) => (
                <SectionView key={section.id} section={section} />
              ))}
              <Button variant="outline" className="mx-5 mb-10 mt-9 self-start" onClick={addSection}>
                + Ny lista
              </Button>
            </>
          )}
        </div>
      </main>
      {showQuickAdd && <QuickAddBar keyboardOpen={keyboardOpen} />}
    </div>
  );
}
