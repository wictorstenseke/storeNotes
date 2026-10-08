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

export type Person = { email: string; pending: boolean };

type Props = {
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
  onSignOut(): void;
  onEditOrder(): void;
};

export function SettingsPanel({ loadPeople, invite, onSignOut, onEditOrder }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPeople(await loadPeople());
  }, [loadPeople]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    await refresh();
  };

  return (
    <div className="flex flex-col gap-5 px-4 pb-8">
      <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Dela med
          <input
            className="w-full border-b border-line bg-transparent py-2 text-[16px] text-ink caret-notes-ink outline-none"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <p className="text-[13px] text-ink-2">De ser den här listan när de loggar in med den e-postadressen.</p>
        <button type="submit" className="self-start text-[14px] font-semibold text-notes-ink">
          Bjud in
        </button>
        {error && (
          <p role="alert" className="text-[14px]">
            {error}
          </p>
        )}
      </form>
      <ul className="flex flex-col gap-1">
        {people.map((person) => (
          <li key={person.email} className="flex justify-between text-[14px]">
            <span>{person.email}</span>
            {person.pending && <span className="text-ink-2">Inbjuden</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-3">
        <button type="button" className="text-[14px] text-notes-ink" onClick={onEditOrder}>
          Editera ordningen
        </button>
        <button type="button" className="text-[14px] text-notes-ink" onClick={onSignOut}>
          Logga ut
        </button>
      </div>
    </div>
  );
}

export function SettingsSheet(props: Omit<Props, 'onEditOrder'>) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Inställningar" className="px-1 text-[18px] leading-none text-ink-2">
        ⚙
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
