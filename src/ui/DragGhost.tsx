import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DragOverlay, type DragStartEvent } from '@dnd-kit/core';
import { setDragging } from './dragging';

// A clone keeps the text a field was created with, not what it shows now.
function snapshot(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  const fields = source.querySelectorAll('textarea');
  copy.querySelectorAll('textarea').forEach((field, index) => {
    field.value = fields[index].value;
  });
  // Its own styles are where the last drag left it: shifted, or hidden while it
  // settles. The ghost is exactly as large as what it copies, so no margin.
  copy.removeAttribute('style');
  copy.style.margin = '0';
  return copy;
}

// What is being dragged: the line or list under the finger, found from where
// the drag began. `lift` and `drop` go on the DndContext.
export function useDragGhost(selector: string) {
  const [ghost, setGhost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!ghost) return;
    setDragging(true);
    return () => setDragging(false);
  }, [ghost]);

  return {
    ghost,
    lift: (event: DragStartEvent) => {
      (document.activeElement as HTMLElement | null)?.blur();
      const source = (event.activatorEvent.target as Element | null)?.closest<HTMLElement>(selector);
      setGhost(source ? snapshot(source) : null);
    },
    drop: () => setGhost(null),
  };
}

type Props = { kind: 'row' | 'list'; ghost: HTMLElement | null };

// The copy that follows the finger. The real line or list stays in the order
// and marks where it will land. A snapshot of the node, so it looks exactly
// like what was picked up without rendering a second set of fields.
export function DragGhost({ kind, ghost }: Props) {
  return createPortal(
    <DragOverlay>
      {ghost && (
        <div
          data-drag-ghost={kind}
          aria-hidden
          inert
          ref={(el) => {
            el?.replaceChildren(ghost);
          }}
        />
      )}
    </DragOverlay>,
    document.body,
  );
}
