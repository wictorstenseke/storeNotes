import { CheckIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickAdd } from '../domain/parseQuickAdd';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { useKeyboardInset } from './useKeyboardInset';

export function QuickAddBar() {
  const note = useNoteStore().getState();
  const sections = useNote((s) => s.sections);
  const chosen = useUi((s) => s.quickAddSectionId);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const inset = useKeyboardInset();
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
  const keepFocus = { onMouseDown: (e: { preventDefault(): void }) => e.preventDefault() };

  const canAdd = parseQuickAdd(text).length > 0;

  return (
    <div
      className="fixed inset-x-0 z-10 border-t border-line bg-page shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ bottom: inset, paddingBottom: inset > 0 ? 0 : 'env(safe-area-inset-bottom)' }}
    >
      <form
        className="mx-auto flex max-w-xl flex-col gap-1 px-4 pb-2 pt-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {/* Which section the next item goes to. Tap to switch. */}
        <button
          type="button"
          aria-label={`Lägger till i ${name}. Tryck för att byta lista`}
          className="max-w-full self-start truncate px-3.5 text-[13px] font-semibold text-notes-ink"
          onClick={nextSection}
          {...keepFocus}
        >
          {name}
        </button>
        <div className="flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center rounded-[20px] bg-field px-3.5 py-[7px]"
            onClick={() => field.current?.focus()}
          >
            <textarea
              ref={field}
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
          <button
            type="submit"
            aria-disabled={!canAdd}
            className={`h-9 min-w-24 shrink-0 rounded-full bg-notes px-4 text-[14px] font-semibold text-black transition-opacity ${
              canAdd || added > 0 ? '' : 'opacity-40'
            }`}
            {...keepFocus}
          >
            {added > 0 ? (
              <span className="inline-flex items-center gap-1">
                <CheckIcon className="size-4" strokeWidth={3} />
                {added > 1 ? `${added} tillagda` : 'Tillagd'}
              </span>
            ) : (
              'Lägg till'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
