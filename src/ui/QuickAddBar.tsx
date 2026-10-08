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
        className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[20px] bg-field py-[7px] pl-3.5 pr-3"
          onClick={() => field.current?.focus()}
        >
          <button
            type="button"
            aria-label={`Adding to ${name}. Tap to change section`}
            className="max-w-[40%] shrink-0 truncate text-[13px] font-semibold text-notes-ink"
            onClick={(event) => {
              event.stopPropagation();
              nextSection();
            }}
            {...keepFocus}
          >
            {name}
          </button>
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
      </form>
    </div>
  );
}
