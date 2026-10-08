import { useLayoutEffect, useMemo, useRef } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Category } from '../domain/categories';
import { CATEGORY_LABELS } from '../domain/categoryLabels';
import { effectiveOrder } from '../domain/learning';
import { STORES, getStore } from '../domain/stores';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';

type RowProps = { category: Category; index: number; onMove(dir: -1 | 1): void };

function OrderRow({ category, index, onMove }: RowProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: category,
  });
  const label = CATEGORY_LABELS[category];
  return (
    <li
      ref={setNodeRef}
      className={`flex min-h-11 items-center gap-3 px-4 ${isDragging ? 'relative z-10 bg-field' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-ink-2">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate">
        <span data-testid="category-label" className="text-[16px]">
          {label.name}
        </span>
        {label.examples && <span className="ml-2 text-[13px] text-ink-2">{label.examples}</span>}
      </span>
      {/* Only the handle drags, so the list itself still scrolls with a finger.
          Arrow keys on the handle move the row one step. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${label.name}`}
        data-handle={category}
        className="grid size-9 shrink-0 cursor-grab touch-none place-items-center text-[18px] leading-none text-ink-2"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          onMove(event.key === 'ArrowDown' ? 1 : -1);
        }}
      >
        ≡
      </button>
    </li>
  );
}

type ListProps = { order: Category[]; onChange(order: Category[]): void };

export function StoreOrderList({ order, onChange }: ListProps) {
  const list = useRef<HTMLOListElement>(null);
  const refocus = useRef<Category | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Moving a row in the DOM can drop keyboard focus; put it back on the handle
  // of the row that was moved.
  useLayoutEffect(() => {
    const category = refocus.current;
    if (!category) return;
    refocus.current = null;
    list.current?.querySelector<HTMLElement>(`[data-handle="${category}"]`)?.focus();
  }, [order]);

  const move = (from: number, to: number, keepFocus: boolean) => {
    if (to < 0 || to >= order.length || from === to) return;
    if (keepFocus) refocus.current = order[from];
    onChange(arrayMove(order, from, to));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    move(order.indexOf(event.active.id as Category), order.indexOf(event.over.id as Category), false);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol ref={list}>
          {order.map((category, index) => (
            <OrderRow
              key={category}
              category={category}
              index={index}
              onMove={(dir) => move(index, index + dir, true)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

type PanelProps = { storeId: string; onStore(id: string): void };

// The order is saved on every move and synced like any other change. Checking
// items off in the store keeps adjusting it afterwards.
export function StoreOrderPanel({ storeId, onStore }: PanelProps) {
  const note = useNoteStore().getState();
  const storeOrders = useNote((s) => s.storeOrders);
  const store = getStore(storeId);

  const order = useMemo(() => {
    if (!store) return [];
    const scores = storeOrders.find((o) => o.store_id === store.id)?.scores;
    return effectiveOrder(store.baseline, scores);
  }, [store, storeOrders]);

  if (!store) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="group" aria-label="Store" className="flex gap-4 px-4 pb-2 text-[14px]">
        {STORES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === store.id}
            className={option.id === store.id ? 'font-semibold text-notes-ink' : 'text-ink-2'}
            onClick={() => onStore(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StoreOrderList order={order} onChange={(next) => note.setStoreOrder(store.id, next)} />
      </div>
      <button
        type="button"
        className="self-start px-4 py-3 text-[14px] text-notes-ink"
        onClick={() => note.resetStoreOrder(store.id)}
      >
        Reset to original order
      </button>
    </div>
  );
}

export function StoreOrderSheet() {
  const editing = useUi((s) => s.orderEditorStore);
  const { setOrderEditorStore } = useUi.getState();
  return (
    <Sheet
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) setOrderEditorStore(null);
      }}
    >
      {/* The sheet's own classes are `data-[side=bottom]:…`, so sizes must use the
          same prefix to take effect. */}
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-2xl data-[side=bottom]:mx-auto data-[side=bottom]:h-[88dvh] data-[side=bottom]:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="text-[20px] font-semibold">Store order</SheetTitle>
          <SheetDescription className="text-[13px] text-ink-2">
            Drag the sections into the order you walk past them. Saved as you go.
          </SheetDescription>
        </SheetHeader>
        {editing !== null && <StoreOrderPanel storeId={editing} onStore={setOrderEditorStore} />}
      </SheetContent>
    </Sheet>
  );
}
