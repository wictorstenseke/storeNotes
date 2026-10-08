import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export type Invite = { list_id: string; invited_by: string };

// One of the person's own sections, offered to take along when joining.
export type Keepable = { id: string; title: string; items: number };

type Props = {
  loadInvites(): Promise<Invite[]>;
  sections: Keepable[];
  onAccept(listId: string, keep: string[]): void;
  onDecline(listId: string): Promise<boolean>;
};

// Joining a shared list is always the invited person's choice. Nothing here
// happens until they tap Gå med.
export function InviteBanner({ loadInvites, sections, onAccept, onDecline }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [choosing, setChoosing] = useState(false);
  // Sections that hold items start ticked; empty ones do not.
  const [keep, setKeep] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      loadInvites().then(
        (found) => {
          if (!cancelled) setInvites(found);
        },
        () => {
          // Offline or signed out: there is nothing to show yet.
        },
      );
    };
    load();
    window.addEventListener('online', load);
    return () => {
      cancelled = true;
      window.removeEventListener('online', load);
    };
  }, [loadInvites]);

  const invite = invites[0];
  if (!invite) return null;

  const decline = async () => {
    if (await onDecline(invite.list_id)) {
      setInvites((current) => current.filter((i) => i.list_id !== invite.list_id));
    }
  };

  const start = () => {
    if (sections.length === 0) {
      onAccept(invite.list_id, []);
      return;
    }
    setKeep(sections.filter((section) => section.items > 0).map((section) => section.id));
    setChoosing(true);
  };

  const toggle = (id: string) =>
    setKeep((current) =>
      (current ?? []).includes(id) ? (current ?? []).filter((x) => x !== id) : [...(current ?? []), id],
    );

  if (choosing) {
    return (
      <div role="status" aria-label="Inbjudan" className="mx-5 mt-2 flex flex-col gap-2 text-[14px]">
        <p>
          Vilka av dina listor vill du ta med dig?{' '}
          <span className="text-ink-2">De följer med som de är. Resten tas bort från den här enheten.</span>
        </p>
        <ul className="flex flex-col">
          {sections.map((section) => (
            <li key={section.id}>
              <label className="flex min-h-9 items-center gap-2.5">
                <input
                  type="checkbox"
                  className="size-[18px] accent-notes"
                  checked={(keep ?? []).includes(section.id)}
                  onChange={() => toggle(section.id)}
                />
                <span className="min-w-0 flex-1 truncate">{section.title || 'Namnlös'}</span>
                <span className="text-ink-2">{section.items}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button onClick={() => onAccept(invite.list_id, keep ?? [])}>Gå med</Button>
          <Button variant="outline" onClick={() => setChoosing(false)}>
            Tillbaka
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-label="Inbjudan" className="mx-5 mt-2 flex flex-col gap-1 text-[14px]">
      <p>
        {invite.invited_by} har bjudit in dig att dela sin lista.{' '}
        <span className="text-ink-2">Om du går med byter du till den. Du väljer själv vilka av dina listor som följer med.</span>
      </p>
      <div className="flex gap-2">
        <Button onClick={start}>Gå med</Button>
        <Button variant="outline" onClick={() => void decline()}>
          Avböj
        </Button>
      </div>
    </div>
  );
}
