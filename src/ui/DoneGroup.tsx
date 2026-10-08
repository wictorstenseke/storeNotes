import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { Item } from '../domain/types';
import { MOTION } from './motion';
import { Button } from '@/components/ui/button';

type Props = { items: Item[]; onUncheck(id: string): void; onClear(): void };

export function DoneGroup({ items, onUncheck, onClear }: Props) {
  const [list] = useAutoAnimate<HTMLDivElement>(MOTION);
  // Clearing needs a second press, so a stray tap does not remove everything.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 bg-field/40 py-3 sm:mx-2 sm:rounded-lg">
      <div ref={list}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked
            aria-label={`Avmarkera ${item.text}`}
            className="flex min-h-[30px] w-full items-start gap-2.5 px-5 text-left sm:px-3"
            onClick={() => onUncheck(item.id)}
          >
            <span className="mt-1 grid size-[22px] shrink-0 place-items-center rounded-full bg-done text-[13px] font-bold leading-none text-white">
              <CheckIcon className="size-3.5" strokeWidth={3} />
            </span>
            <span className="py-1 text-[16px] leading-[22px] text-ink-2">{item.text}</span>
          </button>
        ))}
      </div>
      <Button
        variant={confirming ? 'destructive' : 'outline'}
        size="sm"
        className="ml-5 mt-2 bg-page sm:ml-3"
        onBlur={() => setConfirming(false)}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          onClear();
        }}
      >
        {confirming ? 'Jag är säker' : 'Rensa klara'}
      </Button>
    </div>
  );
}
