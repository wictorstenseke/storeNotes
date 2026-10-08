import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byManual } from './domain/sort';
import { NoteStoreProvider, useNote } from './state/context';
import { readSetting } from './state/deviceSettings';
import { startRuntime, type Runtime } from './sync/runtime';
import { InviteBanner } from './ui/InviteBanner';
import { NoteView } from './ui/NoteView';
import { SettingsSheet } from './ui/SettingsSheet';
import { SignIn } from './ui/SignIn';
import { SyncIndicator } from './ui/SyncIndicator';

type Start = (sb: SupabaseClient) => Promise<Runtime>;

// undefined = not known yet. A device with a cached list counts as signed in
// from the first render so the note opens with no network.
function useSignedIn(sb: SupabaseClient): boolean | undefined {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(
    readSetting('listId') ? true : undefined,
  );

  useEffect(() => {
    const check = async () => {
      const { data, error } = await sb.auth.getSession();
      const hasList = Boolean(readSetting('listId'));
      if (data.session) setSignedIn(true);
      // An error means the session could not be checked (signal up, server
      // unreachable), not that it is gone. Keep the note open in that case.
      else if (!hasList || (!error && navigator.onLine)) setSignedIn(false);
    };
    void check();
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setSignedIn(false);
      else if (session) setSignedIn(true);
    });
    window.addEventListener('online', check);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', check);
    };
  }, [sb]);

  return signedIn;
}

// Read inside the provider, so it can offer the person's own sections to take along.
function Invites({ runtime }: { runtime: Runtime }) {
  const sections = useNote((s) => s.sections);
  const items = useNote((s) => s.items);
  const keepable = useMemo(
    () =>
      [...sections].sort(byManual).map((section) => ({
        id: section.id,
        title: section.title,
        items: items.filter((i) => i.section_id === section.id).length,
      })),
    [sections, items],
  );
  return (
    <InviteBanner
      loadInvites={runtime.loadInvites}
      sections={keepable}
      onAccept={(listId, keep) => void runtime.acceptInvite(listId, keep)}
      onDecline={runtime.declineInvite}
    />
  );
}

function Note({ sb, start }: { sb: SupabaseClient; start: Start }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let started: Runtime | null = null;
    setFailed(false);
    start(sb).then(
      (rt) => {
        if (cancelled) rt.stop();
        else {
          started = rt;
          setRuntime(rt);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      started?.stop();
    };
  }, [sb, start, attempt]);

  if (failed) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-3 px-6 pt-24">
        <p className="text-[14px] text-ink-2">Anslut till internet för att slutföra installationen.</p>
        <button
          type="button"
          className="self-start text-[16px] font-semibold text-notes-ink"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Försök igen
        </button>
      </main>
    );
  }
  if (!runtime) return null;

  return (
    <NoteStoreProvider value={runtime.store}>
      <NoteView
        banner={
          <Invites runtime={runtime} />
        }
        header={
          <>
            <SyncIndicator />
            <SettingsSheet
              loadPeople={runtime.loadPeople}
              invite={runtime.invite}
              onSignOut={() => void runtime.signOut()}
            />
          </>
        }
      />
    </NoteStoreProvider>
  );
}

export function App({ sb, start = startRuntime }: { sb: SupabaseClient; start?: Start }) {
  const signedIn = useSignedIn(sb);
  if (signedIn === undefined) return null;
  if (!signedIn) {
    return (
      <SignIn
        auth={{
          signIn: async (args) => {
            const { error } = await sb.auth.signInWithPassword(args);
            return { error };
          },
          signUp: async (args) => {
            // The confirmation link opens this deployment of the app.
            const emailRedirectTo = window.location.origin + import.meta.env.BASE_URL;
            const { data, error } = await sb.auth.signUp({ ...args, options: { emailRedirectTo } });
            return { error, needsConfirmation: !error && !data.session };
          },
        }}
      />
    );
  }
  return <Note sb={sb} start={start} />;
}
