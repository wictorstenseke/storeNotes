import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { effectiveOrder } from '../domain/learning';
import { sortDone, sortOpen } from '../domain/sort';
import { getStore } from '../domain/stores';
import type { Item, Section } from '../domain/types';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { DoneGroup } from './DoneGroup';
import { ItemLine } from './ItemLine';
import { MOTION } from './motion';
import { SectionMenu } from './SectionMenu';

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

function Row({ id, draggable, children }: { id: string; draggable: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      data-draggable={draggable}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
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
        {/* The store is chosen in the menu; name it here so the choice is visible. */}
        {activeStore && (
          <span className="shrink-0 text-[13px] text-ink-2">{activeStore.name}</span>
        )}
        <SectionMenu
          title={section.title}
          storeSort={section.store_sort}
          storeId={storeId}
          onStoreSort={(on) => note.setStoreSort(section.id, on)}
          onStore={ui.setStoreId}
          onDelete={() => note.deleteSection(section.id)}
        />
      </div>
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
              <Row key={item.id} id={item.id} draggable={manual}>
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
