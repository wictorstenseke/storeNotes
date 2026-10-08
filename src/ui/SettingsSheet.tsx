import {
  ChevronLeftIcon,
  ListOrderedIcon,
  LogOutIcon,
  MenuIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
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
import { StoreOrderPanel } from './StoreOrder';
import { useKeyboardInset } from './useKeyboardInset';
import { Button } from '@/components/ui/button';

// Pressing a control must not take focus from the email field, or the keyboard
// closes, the sheet moves and the tap is lost.
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

export type Person = { email: string; pending: boolean };

type PanelProps = {
  loadPeople(): Promise<Person[]>;
  // What the sheet already knows, so it opens at its final height.
  initialPeople?: Person[];
  onPeople?(people: Person[]): void;
  onInvite(): void;
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

type InviteFormProps = {
  invite(email: string): Promise<boolean>;
  onInvited(): void;
  keyboardInset: number;
};

export function InviteForm({ invite, onInvited, keyboardInset }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    onInvited();
  };

  return (
    <form
      className="flex flex-col gap-3 px-4"
      style={{ paddingBottom: keyboardInset > 0 ? '1rem' : 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      onSubmit={submit}
      noValidate
    >
      <label className="flex flex-col gap-1 text-[13px] text-ink-2">
        E-post
        <input
          autoFocus
          className="w-full rounded-lg bg-field px-3.5 py-2.5 text-[16px] text-ink caret-notes-ink outline-none"
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
      <Button type="submit" size="lg" className="self-end" onMouseDown={keepFocus}>
        Bjud in
      </Button>
    </form>
  );
}

export function SettingsPanel({
  loadPeople,
  initialPeople = [],
  onPeople,
  onInvite,
  onSignOut,
  onEditOrder,
}: PanelProps) {
  const [people, setPeople] = useState<Person[]>(initialPeople);

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
        <MenuRow icon={UserPlusIcon} onClick={onInvite}>
          Bjud in
        </MenuRow>
        <MenuRow icon={ListOrderedIcon} onClick={onEditOrder}>
          Ändra butikens gångar
        </MenuRow>
        <MenuRow icon={LogOutIcon} onClick={onSignOut}>
          Logga ut
        </MenuRow>
      </div>
    </div>
  );
}

type View = 'settings' | 'invite' | 'order';

const HEADINGS: Record<View, { title: string; description: string }> = {
  settings: { title: 'Inställningar', description: 'Delning och konto' },
  invite: {
    title: 'Bjud in',
    description: 'De ser den här listan när de loggar in med den e-postadressen.',
  },
  order: {
    title: 'Butikens ordning',
    description: 'Dra avdelningarna i den ordning du går förbi dem. Sparas direkt.',
  },
};

// The sheet changes height when its content does; animate that instead of
// letting it jump.
function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight || undefined);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div style={{ height }} className="overflow-hidden transition-[height] duration-300 ease-out">
      <div ref={inner}>{children}</div>
    </div>
  );
}

type SheetProps = Pick<PanelProps, 'loadPeople' | 'onSignOut'> & {
  invite(email: string): Promise<boolean>;
};

// One sheet for settings, inviting and the store order, so moving between them
// only changes its content and height.
export function SettingsSheet({ loadPeople, invite, onSignOut }: SheetProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('settings');
  const [orderStore, setOrderStore] = useState(STORES[0].id);
  const keyboardInset = useKeyboardInset();
  // Loaded before the sheet opens: people appearing mid-slide made it jump.
  const [people, setPeople] = useState<Person[]>([]);
  const refresh = useCallback(async () => setPeople(await loadPeople()), [loadPeople]);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const { title, description } = HEADINGS[view];
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setView('settings');
        setOpen(next);
      }}
    >
      <SheetTrigger className="flex items-center gap-1.5 py-2 text-[14px] font-semibold text-ink-2">
        <MenuIcon className="size-[18px]" />
        Meny
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-lg data-[side=bottom]:mx-auto data-[side=bottom]:max-w-xl"
        // Stay at the bottom and extend under the keyboard, so no page shows through.
        style={{ paddingBottom: keyboardInset }}
      >
        <AnimatedHeight>
          <SheetHeader>
            <div className="flex items-center gap-1">
              {view !== 'settings' && (
                <button
                  type="button"
                  aria-label="Tillbaka"
                  className="-ml-2 grid size-9 place-items-center text-ink-2"
                  onMouseDown={keepFocus}
                  onClick={() => setView('settings')}
                >
                  <ChevronLeftIcon className="size-6" />
                </button>
              )}
              <SheetTitle className="text-[20px] font-semibold">{title}</SheetTitle>
            </div>
            <SheetDescription
              className={view === 'settings' ? 'sr-only' : 'text-[13px] text-ink-2'}
            >
              {description}
            </SheetDescription>
          </SheetHeader>
          <div key={view} className="animate-in fade-in duration-200">
            {view === 'settings' && (
              <SettingsPanel
                loadPeople={loadPeople}
                onSignOut={onSignOut}
                initialPeople={people}
                onPeople={setPeople}
                onInvite={() => setView('invite')}
                onEditOrder={() => {
                  const { storeId } = useUi.getState();
                  setOrderStore(getStore(storeId)?.id ?? STORES[0].id);
                  setView('order');
                }}
              />
            )}
            {view === 'invite' && (
              <InviteForm
                invite={invite}
                keyboardInset={keyboardInset}
                onInvited={() => {
                  void refresh();
                  setView('settings');
                }}
              />
            )}
            {view === 'order' && (
              <div className="flex h-[calc(88dvh-6rem)] flex-col pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
                <StoreOrderPanel storeId={orderStore} onStore={setOrderStore} />
              </div>
            )}
          </div>
        </AnimatedHeight>
      </SheetContent>
    </Sheet>
  );
}
