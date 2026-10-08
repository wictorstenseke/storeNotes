import {
  ListOrderedIcon,
  LogOutIcon,
  SettingsIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { normalizeEmail } from '../domain/email';
import { STORES, getStore } from '../domain/stores';
import { useUi } from '../state/uiStore';
import { useKeyboardInset } from './useKeyboardInset';

export type Person = { email: string; pending: boolean };

type Props = {
  loadPeople(): Promise<Person[]>;
  // What the sheet already knows, so it opens at its final height.
  initialPeople?: Person[];
  onPeople?(people: Person[]): void;
  invite(email: string): Promise<boolean>;
  onSignOut(): void;
  onEditOrder(): void;
};

function MenuRow({
  icon: Icon,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] active:bg-field"
      onClick={onClick}
    >
      <Icon className="size-5 shrink-0 text-ink-2" />
      {children}
    </button>
  );
}

type InviteProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  invite(email: string): Promise<boolean>;
  onInvited(): void;
};

function InviteSheet({ open, onOpenChange, invite, onInvited }: InviteProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inset = useKeyboardInset();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = normalizeEmail(email);
    if (!address) {
      setError('Ange en giltig e-postadress.');
      return;
    }
    if (!(await invite(address))) {
      setError('Kunde inte spara inbjudan. Kontrollera anslutningen och försök igen.');
      return;
    }
    setError(null);
    setEmail('');
    onOpenChange(false);
    onInvited();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl data-[side=bottom]:mx-auto data-[side=bottom]:max-w-xl"
        style={{ bottom: inset }}
      >
        <SheetHeader>
          <SheetTitle className="text-[20px] font-semibold">Bjud in</SheetTitle>
          <SheetDescription className="text-[14px] text-ink-2">
            De ser den här listan när de loggar in med den e-postadressen.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-3 px-4"
          style={{ paddingBottom: inset > 0 ? '1rem' : 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          onSubmit={submit}
          noValidate
        >
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            E-post
            <input
              className="w-full rounded-[20px] bg-field px-3.5 py-2.5 text-[16px] text-ink caret-notes-ink outline-none"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-[14px]">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="h-10 self-end rounded-full bg-notes px-5 text-[14px] font-semibold text-black"
          >
            Bjud in
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function SettingsPanel({
  loadPeople,
  initialPeople = [],
  onPeople,
  invite,
  onSignOut,
  onEditOrder,
}: Props) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(async () => {
    const next = await loadPeople();
    setPeople(next);
    onPeople?.(next);
  }, [loadPeople, onPeople]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
      {people.length > 0 && (
        <section aria-label="Delad med" className="pb-3">
          <h3 className="px-4 pb-1 text-[13px] text-ink-2">Delad med</h3>
          <ul className="flex flex-col">
            {people.map((person) => (
              <li key={person.email} className="flex justify-between px-4 py-1.5 text-[15px]">
                <span>{person.email}</span>
                {person.pending && <span className="text-ink-2">Inbjuden</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-col border-t border-line">
        <MenuRow icon={UserPlusIcon} onClick={() => setInviting(true)}>
          Bjud in
        </MenuRow>
        <MenuRow icon={ListOrderedIcon} onClick={onEditOrder}>
          Ändra butikens gångar
        </MenuRow>
        <MenuRow icon={LogOutIcon} onClick={onSignOut}>
          Logga ut
        </MenuRow>
      </div>
      <InviteSheet
        open={inviting}
        onOpenChange={setInviting}
        invite={invite}
        onInvited={() => void refresh()}
      />
    </div>
  );
}

export function SettingsSheet(props: Omit<Props, 'onEditOrder' | 'initialPeople' | 'onPeople'>) {
  const [open, setOpen] = useState(false);
  // Loaded before the sheet opens: people appearing mid-slide made it jump.
  const [people, setPeople] = useState<Person[]>([]);
  const { loadPeople } = props;
  useEffect(() => {
    loadPeople().then(setPeople, () => {});
  }, [loadPeople]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Inställningar" className="px-1 text-[18px] leading-none text-ink-2">
        <SettingsIcon className="size-[18px]" />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl data-[side=bottom]:mx-auto data-[side=bottom]:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="text-[20px] font-semibold">Inställningar</SheetTitle>
          <SheetDescription className="sr-only">Delning och konto</SheetDescription>
        </SheetHeader>
        {open && (
          <SettingsPanel
            {...props}
            initialPeople={people}
            onPeople={setPeople}
            onEditOrder={() => {
              setOpen(false);
              const { storeId, setOrderEditorStore } = useUi.getState();
              setOrderEditorStore(getStore(storeId)?.id ?? STORES[0].id);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
