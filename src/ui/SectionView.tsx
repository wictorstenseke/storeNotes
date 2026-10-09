import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ChevronRightIcon } from 'lucide-react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { effectiveOrder } from '../domain/learning';
import { rangeIds, toggleId } from '../domain/selection';
import { sortDone, sortOpen } from '../domain/sort';
import { STORES, getStore } from '../domain/stores';
import type { Item, Section } from '../domain/types';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { DoneGroup } from './DoneGroup';
import { ItemLine } from './ItemLine';
import { MOTION } from './motion';
import { SectionMenu } from './SectionMenu';

type DragListeners = ReturnType<typeof useSortable>['listeners'];

type TitleProps = {
  title: string;
  wantFocus: boolean;
  onFocused(): void;
  onCommit(title: string): void;
  onEnter(): void;
  onToggle(): void;
  // Holding the title (or dragging it with a mouse) moves the whole list.
  dragListeners: DragListeners;
};

// Tapping the title folds the list, so it is read-only until something asks to rename it
// (a new list, or Byt namn in the menu). Only then is it a text field with a keyboard.
function SectionTitle({
  title,
  wantFocus,
  onFocused,
  onCommit,
  onEnter,
  onToggle,
  dragListeners,
}: TitleProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  // Grow with the content so a long title wraps instead of scrolling sideways.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useLayoutEffect(() => {
    if (!wantFocus) return;
    setEditing(true);
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFocus]);

  // Focus once the field has stopped being read-only, or iOS shows no keyboard.
  useLayoutEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  return (
    // iOS offers "Autofyll kontakt" on fields it reads as a name, so neither the
    // label nor the placeholder say "namn"/"name".
    <textarea
      ref={field}
      rows={1}
      value={draft}
      {...(editing ? undefined : dragListeners)}
      readOnly={!editing}
      aria-label="Listrubrik"
      placeholder="Lista"
      enterKeyHint="next"
      autoCapitalize="sentences"
      autoComplete="off"
      className={`mb-1 min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[20px] font-semibold leading-7 caret-notes-ink outline-none placeholder:text-ink-2 ${
        editing ? '' : 'cursor-pointer select-none [-webkit-touch-callout:none]'
      }`}
      onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
      onBlur={() => {
        if (!editing) return;
        setEditing(false);
        onCommit(draft.trim());
      }}
      onMouseDown={(event) => {
        if (editing) return;
        dragListeners?.onMouseDown?.(event);
        event.preventDefault(); // no focus, no text selection
      }}
      onClick={() => {
        if (!editing) onToggle();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (!editing) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onEnter();
      }}
    />
  );
}

type RowProps = {
  id: string;
  draggable: boolean;
  selected: boolean;
  onMouseDown(event: MouseEvent): void;
  onMouseEnter(event: MouseEvent): void;
  children: ReactNode;
};

function Row({ id, draggable, selected, onMouseDown, onMouseEnter, children }: RowProps) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      data-draggable={draggable}
      data-selected={selected}
      className={selected ? 'bg-notes/20' : undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      {...(draggable ? listeners : {})}
    >
      {children}
    </div>
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
  const selection = useUi((s) => s.selection);
  const hideHint = useUi((s) => s.hiddenStoreHints.includes(section.id));
  const collapsed = useUi((s) => s.collapsedSections.includes(section.id));
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const mine = useMemo(() => items.filter((i) => i.section_id === section.id), [items, section.id]);

  const activeStore = section.store_sort ? getStore(storeId) : undefined;

  const order = useMemo(() => {
    if (!activeStore) return null;
    const scores = storeOrders.find((o) => o.store_id === activeStore.id)?.scores;
    return effectiveOrder(activeStore.baseline, scores);
  }, [activeStore, storeOrders]);

  const open = useMemo(() => sortOpen(mine, order, hold), [mine, order, hold]);
  const done = useMemo(() => sortDone(mine), [mine]);

  const manual = order === null;
  const [openList, animateOpen] = useAutoAnimate<HTMLDivElement>(MOTION);
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );

  // dnd-kit moves rows itself while dragging; pause auto-animate so the two
  // do not animate the same rows.
  const onDragStart = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    animateOpen(false);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    const to = overId === undefined ? -1 : open.findIndex((i) => i.id === overId);
    if (to >= 0 && overId !== event.active.id) note.moveItem(String(event.active.id), to);
    requestAnimationFrame(() => animateOpen(true));
  };

  // --- Selecting several lines (mouse and keyboard) ---------------------------
  // The list itself takes focus while lines are selected, so Backspace and the
  // arrow keys reach it instead of a text field.
  const list = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<string | null>(null);
  const openIds = open.map((i) => i.id);
  const own = selection?.sectionId === section.id ? selection : null;
  const selectedIds = new Set(own?.ids ?? []);

  useEffect(() => {
    const endDrag = () => {
      dragFrom.current = null;
    };
    window.addEventListener('mouseup', endDrag);
    return () => window.removeEventListener('mouseup', endDrag);
  }, []);

  const select = (ids: string[], anchor: string, cursor: string) => {
    if (ids.length === 0) {
      ui.setSelection(null);
      return;
    }
    ui.setSelection({ sectionId: section.id, ids, anchor, cursor });
    list.current?.focus();
  };

  // Move the far end of the selection one line up or down.
  const extend = (anchor: string, cursor: string, dir: -1 | 1) => {
    const at = openIds.indexOf(cursor);
    if (at === -1) return;
    const target = openIds[at + dir] ?? cursor;
    select(rangeIds(openIds, anchor, target), anchor, target);
  };

  const onRowMouseDown = (event: MouseEvent, id: string) => {
    if (event.button !== 0) return;
    const current = useUi.getState().selection;
    const mine = current?.sectionId === section.id ? current : null;
    if (event.shiftKey) {
      event.preventDefault(); // keep the text field from taking focus
      const anchor = mine?.anchor ?? useUi.getState().hold?.id ?? id;
      const ids = rangeIds(openIds, anchor, id);
      if (ids.length > 0) select(ids, anchor, id);
      else select([id], id, id);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      select(toggleId(mine?.ids ?? [], id), id, id);
      return;
    }
    if (current) ui.setSelection(null);
    dragFrom.current = id;
  };

  const onRowMouseEnter = (event: MouseEvent, id: string) => {
    const from = dragFrom.current;
    if (event.buttons !== 1 || !from) return;
    const selecting = useUi.getState().selection?.sectionId === section.id;
    if (from === id && !selecting) return; // still inside the line the drag began in
    window.getSelection()?.removeAllRanges();
    select(rangeIds(openIds, from, id), from, id);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return; // a text field has the key
    const current = useUi.getState().selection;
    if (!current || current.sectionId !== section.id) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      for (const id of current.ids) note.deleteItem(id);
      ui.setSelection(null);
    } else if (event.key === 'Escape') {
      ui.setSelection(null);
    } else if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      extend(current.anchor, current.cursor, event.key === 'ArrowDown' ? 1 : -1);
    }
  };

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
    onExtend: (dir: -1 | 1) => extend(item.id, item.id, dir),
    onToggle: () =>
      note.checkItem(item.id, section.store_sort ? useUi.getState().storeId : null),
  });

  return (
    <section
      ref={setNodeRef}
      className="mt-5"
      aria-label={section.title || 'Namnlös lista'}
      aria-expanded={!collapsed}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-2 px-5">
        {/* Only a folded list needs a hint that it can be opened. Its arrow lines up with the titles of
            open lists (the icon has blank space on its left, hence the pull) and pushes the title in. */}
        {collapsed && (
          <ChevronRightIcon
            aria-hidden
            strokeWidth={2.5}
            className="-ml-1.5 -mr-1 mt-1 size-5 shrink-0 self-start text-ink"
          />
        )}
        <SectionTitle
          title={section.title}
          wantFocus={focusId === section.id}
          onFocused={() => ui.requestFocus(null)}
          onCommit={(title) => note.renameSection(section.id, title)}
          onEnter={() => startLine(null, open.length)}
          onToggle={() => {
            if (useUi.getState().selection?.sectionId === section.id) ui.setSelection(null);
            ui.toggleCollapsed(section.id);
          }}
          dragListeners={listeners}
        />
        {/* Names the store (or says none is chosen). Tap to step through none and each store; the menu has the same choice. */}
        {!hideHint && (
          <button
            type="button"
            aria-label={`${activeStore ? activeStore.name : 'Ingen butik vald'}. Tryck för att byta butik`}
            className="shrink-0 cursor-pointer text-[13px] text-notes-ink transition-opacity hover:opacity-70 active:opacity-50"
            onClick={() => {
              // The store is per device, whether to sort by it is per list.
              const at = activeStore ? STORES.findIndex((s) => s.id === activeStore.id) : -1;
              const next = STORES[at + 1];
              if (next) useUi.getState().setStoreId(next.id);
              note.setStoreSort(section.id, next !== undefined);
            }}
          >
            {activeStore ? activeStore.name : 'Ingen butik vald'}
          </button>
        )}
        <SectionMenu
          title={section.title}
          storeSort={section.store_sort}
          storeId={storeId}
          hideHint={hideHint}
          onToggleHint={() => ui.toggleStoreHint(section.id)}
          onStore={(id) => {
            // The store is per device, whether to sort by it is per list.
            if (id) ui.setStoreId(id);
            note.setStoreSort(section.id, id !== null);
          }}
          onRename={() => ui.requestFocus(section.id)}
          onDelete={() => note.deleteSection(section.id)}
        />
      </div>
      {!collapsed && (
        <>
      <div
        ref={list}
        tabIndex={-1}
        className="outline-none"
        onKeyDown={onListKeyDown}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (useUi.getState().selection?.sectionId === section.id) ui.setSelection(null);
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => animateOpen(true)}
        >
          <SortableContext items={open.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div ref={openList}>
              {open.map((item, index) => (
                <Row
                  key={item.id}
                  id={item.id}
                  draggable={manual}
                  selected={selectedIds.has(item.id)}
                  onMouseDown={(event) => onRowMouseDown(event, item.id)}
                  onMouseEnter={(event) => onRowMouseEnter(event, item.id)}
                >
                  <ItemLine
                    item={item}
                    wantFocus={focusId === item.id}
                    {...lineHandlers(item, index)}
                  />
                </Row>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      {/* With nothing open there is no line to tap, so offer one. */}
      {open.length === 0 && (
        <button
          type="button"
          aria-label={`Lägg till vara i ${section.title || 'listan'}`}
          className="flex min-h-[30px] w-full items-start px-5 text-left text-ink-2"
          onClick={() => startLine(null, 0)}
        >
          <span className="py-1 text-[16px] italic leading-[22px]">Lägg till</span>
        </button>
      )}
      <DoneGroup
        items={done}
        onUncheck={note.uncheckItem}
        onClear={() => note.clearDone(section.id)}
      />
        </>
      )}
    </section>
  );
}
