import { EllipsisIcon } from 'lucide-react';
import { useState } from 'react';
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
  onStore(id: string | null): void;
  onDelete(): void;
};

const NO_STORE = 'none';

export function SectionMenu({
  title,
  storeSort,
  storeId,
  onStore,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const chosen = storeSort ? (getStore(storeId)?.id ?? NO_STORE) : NO_STORE;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Alternativ för ${title || 'lista'}`}
          className="shrink-0 px-1 text-ink-2"
        >
          <EllipsisIcon className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
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
          <DropdownMenuSeparator />
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
