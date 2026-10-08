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

export type Person = { email: string; pending: boolean };

type Props = {
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
  onSignOut(): void;
};

export function SettingsPanel({ loadPeople, invite, onSignOut }: Props) {
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
      setError('Enter a valid email address.');
      return;
    }
    if (!(await invite(address))) {
      setError('Could not save the invite. Check your connection and try again.');
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
          Share with
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
        <p className="text-[13px] text-ink-2">They see this list when they sign in with that email.</p>
        <button type="submit" className="self-start text-[14px] font-semibold text-notes-ink">
          Invite
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
            {person.pending && <span className="text-ink-2">Invited</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="self-start text-[14px] text-notes-ink" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

export function SettingsSheet(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Settings" className="px-1 text-[18px] leading-none text-ink-2">
        ⚙
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="text-[20px] font-semibold">Settings</SheetTitle>
          <SheetDescription className="sr-only">Sharing and account</SheetDescription>
        </SheetHeader>
        {open && <SettingsPanel {...props} />}
      </SheetContent>
    </Sheet>
  );
}
