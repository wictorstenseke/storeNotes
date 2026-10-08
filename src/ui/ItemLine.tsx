import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Item } from '../domain/types';

export type ItemLineProps = {
  item: Item;
  wantFocus: boolean;
  onFocused(): void;
  onFocus(): void;
  onBlur(text: string): void;
  onEnter(text: string): void;
  onBackspaceEmpty(): void;
  onArrow(dir: -1 | 1): void;
  onExtend(dir: -1 | 1): void; // Shift+arrow: start selecting lines from this one
  onToggle(): void;
};

export function ItemLine(props: ItemLineProps) {
  const { item, wantFocus } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  const editing = useRef(false);
  // True once something has been typed since the line gained focus.
  const dirty = useRef(false);
  const [draft, setDraft] = useState(item.text);

  // Take changes from outside unless there is typed text to protect. A line
  // that is only focused must follow them, or leaving it would write the old
  // text back over the other person's edit.
  useEffect(() => {
    if (!editing.current || !dirty.current) setDraft(item.text);
  }, [item.text]);

  // Grow with the content so long text wraps instead of scrolling sideways.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // A layout effect runs inside the tap or key handler that asked for focus,
  // which is what lets iOS keep the keyboard open.
  useLayoutEffect(() => {
    const el = field.current;
    if (!wantFocus || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    props.onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const el = event.currentTarget;
    if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      props.onExtend(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onEnter(draft);
    } else if (event.key === 'Backspace' && draft === '') {
      event.preventDefault();
      props.onBackspaceEmpty();
    } else if (event.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault();
      props.onArrow(-1);
    } else if (event.key === 'ArrowDown' && el.selectionStart === draft.length) {
      event.preventDefault();
      props.onArrow(1);
    }
  };

  const toggle = () => {
    if (editing.current) field.current?.blur();
    props.onToggle();
  };

  return (
    <div
      className="flex min-h-9 items-start gap-2.5 px-4"
      data-item-id={item.id}
      onClick={(event) => {
        // Shift- and Cmd-click select lines; they must not start editing one.
        if (event.shiftKey || event.metaKey || event.ctrlKey) return;
        field.current?.focus();
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Markera ${item.text}`}
        className="mt-[7px] size-[22px] shrink-0 rounded-full border-[1.5px] border-line"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      />
      <textarea
        ref={field}
        rows={1}
        value={draft}
        aria-label="Vara"
        autoCapitalize="sentences"
        enterKeyHint="next"
        className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[7px] text-[16px] leading-[22px] caret-notes-ink outline-none"
        onChange={(event) => {
          dirty.current = true;
          setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '));
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          editing.current = true;
          dirty.current = false;
          props.onFocus();
        }}
        onBlur={() => {
          editing.current = false;
          dirty.current = false;
          props.onBlur(draft);
        }}
      />
    </div>
  );
}
