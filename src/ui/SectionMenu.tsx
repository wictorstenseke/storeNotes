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
  onEditOrder(): void;
  onDelete(): void;
};

const NO_STORE = 'none';

export function SectionMenu({
  title,
  storeSort,
  storeId,
  onStoreSort,
  onStore,
  onEditOrder,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const chosen = getStore(storeId)?.id ?? NO_STORE;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Options for ${title || 'section'}`}
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
                  No store
                </DropdownMenuRadioItem>
                {STORES.map((store) => (
                  <DropdownMenuRadioItem key={store.id} value={store.id} closeOnClick>
                    {store.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuItem onClick={onEditOrder}>Edit store order</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuCheckboxItem
            checked={storeSort}
            onCheckedChange={(checked) => onStoreSort(checked === true)}
          >
            Sort by store
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={() => setConfirming(true)}>Delete section</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this section?</AlertDialogTitle>
            <AlertDialogDescription>Its items are deleted too.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
