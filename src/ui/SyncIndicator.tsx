import { useSyncStatus } from '../state/syncStatus';

export function SyncIndicator() {
  const pending = useSyncStatus((s) => s.pending);
  const online = useSyncStatus((s) => s.online);
  const notice = useSyncStatus((s) => s.notice);
  const text = notice ?? (!online && pending > 0 ? 'Offline — changes will sync' : null);
  if (!text) return null;
  return (
    <p role="status" className="mr-auto text-[13px] text-ink-2">
      {text}
    </p>
  );
}
