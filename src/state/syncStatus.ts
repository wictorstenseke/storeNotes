import { create } from 'zustand';

type SyncStatus = { pending: number; online: boolean; notice: string | null };

export const useSyncStatus = create<SyncStatus>()(() => ({
  pending: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  notice: null,
}));

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export function showNotice(text: string): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  useSyncStatus.setState({ notice: text });
  noticeTimer = setTimeout(() => useSyncStatus.setState({ notice: null }), 4000);
}
