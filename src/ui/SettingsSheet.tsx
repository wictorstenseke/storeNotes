import { ChevronLeftIcon, ChevronRightIcon, MenuIcon } from 'lucide-react';
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
import LiquidGlass from 'liquid-glass-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { isDarkMode, setDarkMode } from '../theme';

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

const ROW = 'flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[16px]';

// A white card of rows on the grey sheet: label on the left, value or chevron on the right.
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h3 className="mb-1 text-[13px] text-ink-2">{title}</h3>}
      <div className="flex flex-col divide-y divide-line/25 overflow-hidden rounded-lg bg-page">{children}</div>
    </section>
  );
}

function NavRow({ onClick, children }: { onClick(): void; children: string }) {
  return (
    <button type="button" className={`${ROW} active:bg-field`} onClick={onClick}>
      {children}
      <ChevronRightIcon className="size-5 shrink-0 text-ink-2" />
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

  const showQuickAdd = useUi((s) => s.showQuickAdd);
  const { setShowQuickAdd } = useUi.getState();
  const [darkMode, setDarkModeState] = useState(isDarkMode);
  const onDarkMode = (dark: boolean) => {
    setDarkMode(dark);
    setDarkModeState(dark);
  };

  return (
    <div className="flex max-h-[70dvh] flex-col gap-5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
      <Group title="Delning">
        {people.map((person) => (
          <div key={person.email} className={ROW}>
            <span className="min-w-0 truncate">{person.email}</span>
            <span className="shrink-0 text-ink-2">{person.pending ? 'Inbjuden' : 'Har tillgång'}</span>
          </div>
        ))}
        <NavRow onClick={onInvite}>Bjud in</NavRow>
      </Group>
      <Group title="Visning">
        <div className={`${ROW} py-2`}>
          <div className="flex min-w-0 flex-col" onClick={() => setShowQuickAdd(!showQuickAdd)}>
            <span>Snabbtillägg</span>
            <span id="quick-add-hint" className="text-[13px] text-ink-2">
              Fältet längst ner för att lägga till varor
            </span>
          </div>
          <Switch
            aria-label="Snabbtillägg"
            aria-describedby="quick-add-hint"
            checked={showQuickAdd}
            onCheckedChange={setShowQuickAdd}
          />
        </div>
        <div className={ROW}>
          <span>Mörkt läge</span>
          <Switch aria-label="Mörkt läge" checked={darkMode} onCheckedChange={onDarkMode} />
        </div>
      </Group>
      <Group title="Butik">
        <NavRow onClick={onEditOrder}>Ändra butikens gångar</NavRow>
      </Group>
      <Group>
        <button type="button" className={`${ROW} active:bg-field`} onClick={onSignOut}>
          Logga ut
        </button>
      </Group>
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
  const glassArea = useRef<HTMLDivElement>(null);
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
      {/* Liquid glass sits behind a transparent trigger, which keeps the sheet's a11y and open handling. */}
      <div ref={glassArea} className="relative size-11">
        <LiquidGlass
          mouseContainer={glassArea}
          cornerRadius={22}
          padding="0"
          blurAmount={0.1}
          displacementScale={50}
          elasticity={0.25}
          style={{ position: 'absolute', top: '50%', left: '50%' }}
        >
          <div className="grid size-11 place-items-center text-ink">
            <MenuIcon className="size-5" />
          </div>
        </LiquidGlass>
        <SheetTrigger
          aria-label="Meny"
          className="absolute inset-0 z-10 rounded-full"
        />
      </div>
      <SheetContent
        side="bottom"
        className={`gap-0 rounded-t-lg data-[side=bottom]:mx-auto data-[side=bottom]:max-w-xl ${
          view === 'settings' ? 'bg-field!' : ''
        }`}
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
              <SheetTitle className="mb-1 text-[20px] font-semibold">{title}</SheetTitle>
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
