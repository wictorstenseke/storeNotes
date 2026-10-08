import type { Item } from '../domain/types';

type Props = { items: Item[]; onUncheck(id: string): void; onClear(): void };

export function DoneGroup({ items, onUncheck, onClear }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1">
      <div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked
            aria-label={`Uncheck ${item.text}`}
            className="flex min-h-9 w-full items-start gap-2.5 px-4 text-left"
            onClick={() => onUncheck(item.id)}
          >
            <span className="mt-[7px] grid size-[22px] shrink-0 place-items-center rounded-full bg-notes text-[13px] font-bold leading-none text-white">
              ✓
            </span>
            <span className="py-[8px] text-[14px] leading-5 text-ink-2">{item.text}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ml-[50px] mt-1 text-[13px] text-notes-ink" onClick={onClear}>
        Clear done
      </button>
    </div>
  );
}
