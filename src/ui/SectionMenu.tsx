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
  onStoreSort(on: boolean): void;
  onStore(id: string | null): void;
  onDelete(): void;
};

const NO_STORE = 'none';

export function SectionMenu({
  title,
  storeSort,
  storeId,
  onStoreSort,
  onStore,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const chosen = getStore(storeId)?.id ?? NO_STORE;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Alternativ för ${title || 'sektion'}`}
          className="shrink-0 px-1 text-[18px] leading-none text-ink-2"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {storeSort && (
            <>
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
            </>
          )}
          <DropdownMenuCheckboxItem
            checked={storeSort}
            onCheckedChange={(checked) => onStoreSort(checked === true)}
          >
            Sortera efter butik
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={() => setConfirming(true)}>Ta bort sektion</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort sektionen?</AlertDialogTitle>
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
