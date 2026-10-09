import { CheckIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { parseQuickAdd } from '../domain/parseQuickAdd';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';

// iOS scrolls the page to reveal a field that the keyboard is about to cover, and
// this field sits at the bottom, so the whole list would scroll away. Focusing it
// while it is moved out of the way means there is nothing to reveal.
export function focusWithoutScroll(el: HTMLTextAreaElement) {
  if (document.activeElement === el) return;
  el.style.transform = 'translateY(-9999px)';
  el.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    el.style.transform = '';
  });
}

export function QuickAddBar({ keyboardOpen }: { keyboardOpen: boolean }) {
  const note = useNoteStore().getState();
  const sections = useNote((s) => s.sections);
  const chosen = useUi((s) => s.quickAddSectionId);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  // How many items the last submit added; shown briefly on the button as confirmation.
  const [added, setAdded] = useState(0);
  const clearAdded = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(clearAdded.current), []);

  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);
  const target = sorted.find((s) => s.id === chosen) ?? sorted[0];
  if (!target) return null;
  const name = target.title || 'Namnlös';

  const submit = () => {
    const parts = parseQuickAdd(text);
    if (parts.length === 0) return;
    note.addItems(target.id, parts);
    useUi.getState().setQuickAddSectionId(target.id);
    setText('');
    field.current?.focus();
    setAdded(parts.length);
    clearTimeout(clearAdded.current);
    clearAdded.current = setTimeout(() => setAdded(0), 1400);
  };

  const nextSection = () => {
    const at = sorted.findIndex((s) => s.id === target.id);
    useUi.getState().setQuickAddSectionId(sorted[(at + 1) % sorted.length].id);
  };

  // Tapping a button must not take focus from the field, or the keyboard closes.
  const keepFocus = {
    onMouseDown: (e: { preventDefault(): void }) => e.preventDefault(),
  };

  const canAdd = parseQuickAdd(text).length > 0;

  return (
    <div
      className="relative z-10 shrink-0 border-t border-line bg-page shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{
        paddingBottom: keyboardOpen ? 0 : 'env(safe-area-inset-bottom)',
      }}
    >
      <form
        className="mx-auto flex max-w-xl flex-col gap-1 px-5 pb-2 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {/* Which section the next item goes to. Tap to switch. The close button sits at the top right. */}
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            aria-label={`Lägger till i ${name}. Tryck för att byta lista`}
            className="min-w-0 max-w-full truncate text-left text-[13px]"
            onClick={nextSection}
            {...keepFocus}
          >
            <span className="text-ink-2">Lista: </span>
            <span className="font-semibold text-notes-ink">{name}</span>
          </button>
          <button
            type="button"
            aria-label="Stäng"
            className="-mr-1.5 -mt-1.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-ink/5 hover:text-ink active:bg-ink/10"
            onClick={() => useUi.getState().setShowQuickAdd(false)}
            {...keepFocus}
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center rounded-lg bg-field px-3.5 py-[7px]"
            onClick={() => field.current && focusWithoutScroll(field.current)}
          >
            <textarea
              ref={field}
              onMouseDown={(event) => {
                if (document.activeElement === event.currentTarget) return;
                event.preventDefault();
                focusWithoutScroll(event.currentTarget);
              }}
              rows={1}
              value={text}
              aria-label="Lägg till vara"
              placeholder="Lägg till vara"
              enterKeyHint="done"
              autoCapitalize="sentences"
              className="min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-[22px] caret-notes-ink outline-none placeholder:text-ink-2"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                submit();
              }}
            />
          </div>
          {/* Not `disabled`: a disabled button would take the tap and close the keyboard. */}
          <Button
            type="submit"
            size="lg"
            aria-disabled={!canAdd}
            className={`min-w-24 shrink-0 ${canAdd || added > 0 ? '' : 'opacity-40'}`}
            {...keepFocus}
          >
            {added > 0 ? (
              <>
                <CheckIcon data-icon="inline-start" strokeWidth={3} />
                {added > 1 ? `${added} tillagda` : 'Tillagd'}
              </>
            ) : (
              'Lägg till'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
