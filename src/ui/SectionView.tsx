import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { effectiveOrder } from '../domain/learning';
import { sortDone, sortOpen } from '../domain/sort';
import { getStore } from '../domain/stores';
import type { Item, Section } from '../domain/types';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { DoneGroup } from './DoneGroup';
import { ItemLine } from './ItemLine';
import { SectionMenu } from './SectionMenu';
import { StorePicker } from './StorePicker';

type TitleProps = {
  title: string;
  wantFocus: boolean;
  onFocused(): void;
  onCommit(title: string): void;
  onEnter(): void;
};

function SectionTitle({ title, wantFocus, onFocused, onCommit, onEnter }: TitleProps) {
  const field = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing.current) setDraft(title);
  }, [title]);

  useLayoutEffect(() => {
    if (!wantFocus) return;
    field.current?.focus();
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFocus]);

  return (
    <input
      ref={field}
      value={draft}
      aria-label="Section title"
      placeholder="Section"
      enterKeyHint="next"
      className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold leading-7 caret-notes-ink outline-none placeholder:text-ink-2"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        onCommit(draft.trim());
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter();
      }}
    />
  );
}

export function SectionView({ section }: { section: Section }) {
  // Actions are stable, so reading them once per render is safe.
  const note = useNoteStore().getState();
  const ui = useUi.getState();
  const items = useNote((s) => s.items);
  const storeOrders = useNote((s) => s.storeOrders);
  const focusId = useUi((s) => s.focusId);
  const hold = useUi((s) => s.hold);
  const storeId = useUi((s) => s.storeId);

  const mine = useMemo(() => items.filter((i) => i.section_id === section.id), [items, section.id]);

  const order = useMemo(() => {
    const store = section.store_sort ? getStore(storeId) : undefined;
    if (!store) return null;
    const scores = storeOrders.find((o) => o.store_id === store.id)?.scores;
    return effectiveOrder(store.baseline, scores);
  }, [section.store_sort, storeId, storeOrders]);

  const open = useMemo(() => sortOpen(mine, order, hold), [mine, order, hold]);
  const done = useMemo(() => sortDone(mine), [mine]);

  // Create an empty line, hold it at `index` and move focus to it.
  const startLine = (afterId: string | null, index: number) => {
    const id = note.addItem(section.id, '', afterId);
    ui.setHold({ id, index });
    ui.requestFocus(id);
  };

  const lineHandlers = (item: Item, index: number) => ({
    onFocused: () => ui.requestFocus(null),
    onFocus: () => {
      if (useUi.getState().hold?.id !== item.id) ui.setHold({ id: item.id, index });
    },
    onBlur: (text: string) => {
      if (useUi.getState().hold?.id === item.id) ui.setHold(null);
      const clean = text.trim();
      if (clean === '') note.deleteItem(item.id);
      else note.setItemText(item.id, clean);
    },
    onEnter: (text: string) => {
      const clean = text.trim();
      if (clean === '') {
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      note.setItemText(item.id, clean);
      startLine(item.id, index + 1);
    },
    onBackspaceEmpty: () => {
      const above = open[index - 1];
      if (above) {
        ui.setHold({ id: above.id, index: index - 1 });
        ui.requestFocus(above.id);
      } else {
        ui.setHold(null);
      }
      note.deleteItem(item.id);
    },
    onArrow: (dir: -1 | 1) => {
      const target = open[index + dir];
      if (target) ui.requestFocus(target.id);
    },
    onToggle: () =>
      note.checkItem(item.id, section.store_sort ? useUi.getState().storeId : null),
  });

  return (
    <section className="mt-5" aria-label={section.title || 'Untitled section'}>
      <div className="flex items-center gap-2 px-4">
        <SectionTitle
          title={section.title}
          wantFocus={focusId === section.id}
          onFocused={() => ui.requestFocus(null)}
          onCommit={(title) => note.renameSection(section.id, title)}
          onEnter={() => startLine(null, open.length)}
        />
        <SectionMenu
          title={section.title}
          storeSort={section.store_sort}
          onStoreSort={(on) => note.setStoreSort(section.id, on)}
          onDelete={() => note.deleteSection(section.id)}
        />
      </div>
      {section.store_sort && (
        <div className="px-4 pb-1">
          <StorePicker value={storeId} onChange={ui.setStoreId} />
        </div>
      )}
      <div>
        {open.map((item, index) => (
          <ItemLine
            key={item.id}
            item={item}
            wantFocus={focusId === item.id}
            {...lineHandlers(item, index)}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label={`Add item to ${section.title || 'section'}`}
        className="block h-9 w-full"
        onClick={() => startLine(null, open.length)}
      />
      <DoneGroup
        items={done}
        onUncheck={note.uncheckItem}
        onClear={() => note.clearDone(section.id)}
      />
    </section>
  );
}
