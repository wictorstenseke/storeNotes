import { CheckIcon } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { Item } from '../domain/types';
import { MOTION } from './motion';
import { Button } from '@/components/ui/button';

type Props = { items: Item[]; onUncheck(id: string): void; onClear(): void };

export function DoneGroup({ items, onUncheck, onClear }: Props) {
  const [list] = useAutoAnimate<HTMLDivElement>(MOTION);
  if (items.length === 0) return null;
  return (
    <div className="mt-1">
      <div ref={list}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked
            aria-label={`Avmarkera ${item.text}`}
            className="flex min-h-[30px] w-full items-start gap-2.5 px-5 text-left"
            onClick={() => onUncheck(item.id)}
          >
            <span className="mt-1 grid size-[22px] shrink-0 place-items-center rounded-full bg-notes text-[13px] font-bold leading-none text-white">
              <CheckIcon className="size-3.5" strokeWidth={3} />
            </span>
            <span className="py-[5px] text-[14px] leading-5 text-ink-2">{item.text}</span>
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" className="ml-[54px] mt-2" onClick={onClear}>
        Rensa klara
      </Button>
    </div>
  );
}
