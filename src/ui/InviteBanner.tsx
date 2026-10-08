import { useEffect, useState } from 'react';

export type Invite = { list_id: string; invited_by: string };

type Props = {
  loadInvites(): Promise<Invite[]>;
  onAccept(listId: string): void;
  onDecline(listId: string): Promise<boolean>;
};

// Joining a shared list is always the invited person's choice. Nothing here
// happens until they tap Join.
export function InviteBanner({ loadInvites, onAccept, onDecline }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);

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

  return (
    <div role="status" aria-label="Invitation" className="mx-4 mt-2 flex flex-col gap-1 text-[14px]">
      <p>
        {invite.invited_by} invited you to share their list.{' '}
        <span className="text-ink-2">Joining replaces the list on this device.</span>
      </p>
      <div className="flex gap-4">
        <button
          type="button"
          className="font-semibold text-notes-ink"
          onClick={() => onAccept(invite.list_id)}
        >
          Join
        </button>
        <button type="button" className="text-ink-2" onClick={() => void decline()}>
          Decline
        </button>
      </div>
    </div>
  );
}
