import { useMemo, useRef, useState } from 'react';
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

  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);
  const target = sorted.find((s) => s.id === chosen) ?? sorted[0];
  if (!target) return null;
  const name = target.title || 'Untitled';

  const submit = () => {
    const parts = parseQuickAdd(text);
    if (parts.length === 0) return;
    note.addItems(target.id, parts);
    useUi.getState().setQuickAddSectionId(target.id);
    setText('');
    field.current?.focus();
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
      className="fixed inset-x-0 z-10 bg-page"
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
          aria-label={`Adding to ${name}. Tap to change section`}
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
              aria-label="Add item"
              placeholder="Add item"
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
            className={`h-9 shrink-0 rounded-full bg-notes px-4 text-[14px] font-semibold text-black transition-opacity ${
              canAdd ? '' : 'opacity-40'
            }`}
            {...keepFocus}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
