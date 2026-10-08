import { render, screen } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { writeSetting } from './state/deviceSettings';
import type { Runtime } from './sync/runtime';
import { makeStore } from './test/helpers';

function fakeSupabase(session: unknown): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient;
}

async function fakeStart(): Promise<Runtime> {
  const { store } = await makeStore();
  store.getState().addSection('Grocery List');
  return {
    store,
    listId: 'list-1',
    stop: vi.fn(),
    signOut: vi.fn(async () => {}),
    loadPeople: vi.fn(async () => []),
    invite: vi.fn(async () => true),
  };
}

const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });

beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

describe('App', () => {
  it('shows sign-in on a new device', async () => {
    const start = vi.fn(fakeStart);
    render(<App sb={fakeSupabase(null)} start={start} />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it('shows the note when signed in', async () => {
    render(<App sb={fakeSupabase({ user: { id: 'u1' } })} start={fakeStart} />);
    expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
  });

  it('opens the note offline on a device that has used the app, even with no session', async () => {
    writeSetting('listId', 'list-1');
    setOnline(false);
    render(<App sb={fakeSupabase(null)} start={fakeStart} />);
    expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('asks to sign in again when online with no session', async () => {
    writeSetting('listId', 'list-1');
    render(<App sb={fakeSupabase(null)} start={fakeStart} />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('offers a retry when first-time setup cannot reach the server', async () => {
    const start = vi.fn(async (): Promise<Runtime> => {
      throw new Error('offline');
    });
    render(<App sb={fakeSupabase({ user: { id: 'u1' } })} start={start} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
