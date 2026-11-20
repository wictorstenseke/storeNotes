import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Item } from '../domain/types';
import { MOTION } from './motion';
import { Button } from '@/components/ui/button';

type Props = {
  items: Item[];
  // Just unchecked, and staying in place for a moment before they move back up.
  unchecked?: ReadonlySet<string>;
  onToggle(id: string): void;
  onClear(): void;
};

export function DoneGroup({ items, unchecked, onToggle, onClear }: Props) {
  const [list] = useAutoAnimate<HTMLDivElement>(MOTION);
  // Clearing is confirmed in a dialog, away from the button: the button moves as
  // lines come and go, so a second press in the same place proves nothing.
  const [confirming, setConfirming] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 bg-field/40 py-3 sm:mx-2 sm:rounded-lg">
      <div ref={list}>
        {items.map((item) => {
          const checked = !unchecked?.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={`${checked ? 'Avmarkera' : 'Markera'} ${item.text}`}
              className="flex min-h-[32px] w-full items-start gap-2.5 px-5 text-left sm:px-3"
              onClick={() => onToggle(item.id)}
            >
              <span
                className={`mt-[5px] grid size-[22px] shrink-0 place-items-center rounded-full ${
                  checked ? 'bg-done text-white' : 'border-[1.5px] border-line'
                }`}
              >
                {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
              </span>
              <span
                className={`py-[5px] text-[16px] leading-[22px] ${checked ? 'text-ink-2' : ''}`}
              >
                {item.text}
              </span>
            </button>
          );
        })}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ml-5 mt-2 bg-page sm:ml-3"
        onClick={() => setConfirming(true)}
      >
        Rensa klara
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rensa klara varor?</AlertDialogTitle>
            <AlertDialogDescription>
              Alla avbockade varor i listan tas bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onClear();
              }}
            >
              Rensa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
