import { ListPlusIcon, PlusIcon, ShoppingBasketIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
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
import { GLASS_BUTTON, GlassSurface } from './GlassSurface';
import { ListControls } from './ListControls';
import { QuickAddBar, focusWithoutScroll } from './QuickAddBar';
import { SyncIndicator } from './SyncIndicator';
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
          {/* Zero height, so the button hangs out of it and stays in view while the list scrolls. */}
          <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top)+1.25rem)] z-20 mt-5 h-0 px-5">
            <div className="flex items-start justify-between">
              <div className="pointer-events-auto w-fit">{header}</div>
              {sorted.length > 0 ? <ListControls onNewList={addSection} /> : <span />}
            </div>
          </div>
          <div className="flex h-11 items-center px-5">
            <SyncIndicator />
          </div>
          {banner}
          {sorted.length === 0 ? (
            <Empty className="mx-5 mt-6 w-auto flex-none rounded-lg bg-field px-6 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-page">
                  <ShoppingBasketIcon />
                </EmptyMedia>
                <EmptyTitle>Inga listor än</EmptyTitle>
                <EmptyDescription>
                  Skapa din första lista för att börja lägga till varor.
                </EmptyDescription>
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
              <button
                type="button"
                className="mx-5 mb-10 mt-9 flex items-center gap-2 self-start text-[15px] text-notes-ink transition-opacity active:opacity-60"
                onClick={addSection}
              >
                <ListPlusIcon className="size-5" />
                Ny lista
              </button>
            </>
          )}
        </div>
      </main>

      {/* Outside the scroll area, so it stays put however far the list scrolls (a sticky element
          drifts when the list ends). Only shown without the bar, so nothing sits under it. */}
      {!showQuickAdd && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20"
          style={{
            bottom: keyboardOpen ? '1.25rem' : 'calc(env(safe-area-inset-bottom) + 1.25rem)',
          }}
        >
          <div className="mx-auto flex max-w-xl justify-end px-5">
            <GlassSurface
              width={52}
              height={52}
              className="pointer-events-auto"
              glass={<PlusIcon className="size-6" />}
            >
              <button
                type="button"
                aria-label="Lägg till varor"
                className={`absolute inset-0 z-10 ${GLASS_BUTTON}`}
                onClick={() => {
                  // Focus inside the tap, or iOS won't raise the keyboard: render the bar synchronously first.
                  flushSync(() => useUi.getState().setShowQuickAdd(true));
                  const field = document.querySelector<HTMLTextAreaElement>(
                    'textarea[aria-label="Lägg till vara"]',
                  );
                  if (field) focusWithoutScroll(field);
                }}
              />
            </GlassSurface>
          </div>
        </div>
      )}
      {showQuickAdd && <QuickAddBar keyboardOpen={keyboardOpen} />}
    </div>
  );
}
