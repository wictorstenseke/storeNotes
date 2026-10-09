import { EllipsisIcon } from 'lucide-react';
import { useRef, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STORES, getStore } from '../domain/stores';

type Props = {
  title: string;
  storeSort: boolean;
  storeId: string | null;
  hideHint: boolean;
  onToggleHint(): void;
  onRename(): void;
  onStore(id: string | null): void;
  onDelete(): void;
};

const NO_STORE = 'none';

export function SectionMenu({
  title,
  storeSort,
  storeId,
  hideHint,
  onToggleHint,
  onRename,
  onStore,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  // Renaming moves focus to the title; the menu must not hand it back to its button when it closes.
  const renaming = useRef(false);
  const chosen = storeSort ? (getStore(storeId)?.id ?? NO_STORE) : NO_STORE;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Alternativ för ${title || 'lista'}`}
          className="-mx-0.5 -my-1.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-ink/5 hover:text-ink active:bg-ink/10"
        >
          <EllipsisIcon className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-48"
          finalFocus={() => {
            if (!renaming.current) return;
            renaming.current = false;
            return false;
          }}
        >
          <DropdownMenuRadioGroup
            value={chosen}
            onValueChange={(value) => onStore(value === NO_STORE ? null : String(value))}
          >
            <DropdownMenuRadioItem value={NO_STORE} closeOnClick>
              Ingen butik
            </DropdownMenuRadioItem>
            {STORES.map((store) => (
              <DropdownMenuRadioItem key={store.id} value={store.id} closeOnClick>
                {store.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuCheckboxItem checked={hideHint} onCheckedChange={onToggleHint} closeOnClick>
            Dölj fält
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              renaming.current = true;
              onRename();
            }}
          >
            Byt namn
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirming(true)}>Ta bort lista</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort listan?</AlertDialogTitle>
            <AlertDialogDescription>Alla varor i den tas också bort.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
