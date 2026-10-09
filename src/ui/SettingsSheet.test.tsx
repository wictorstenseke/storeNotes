import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useUi } from '../state/uiStore';
import { InviteForm, SettingsPanel, SettingsSheet, type Person } from './SettingsSheet';

function setup() {
  const people: Person[] = [{ email: 'anna@example.com', pending: false }];
  const props = {
    loadPeople: vi.fn(async () => [...people]),
    onInvite: vi.fn(),
    onSignOut: vi.fn(),
    onEditOrder: vi.fn(),
  };
  render(<SettingsPanel {...props} />);
  return { props, user: userEvent.setup() };
}

describe('SettingsPanel', () => {
  it('lists the people on the list', async () => {
    setup();
    expect(await screen.findByText('anna@example.com')).toBeInTheDocument();
  });

  it('shows already known people without waiting for the load', () => {
    render(
      <SettingsPanel
        loadPeople={() => new Promise(() => {})}
        initialPeople={[{ email: 'anna@example.com', pending: false }]}
        onInvite={vi.fn()}
        onSignOut={vi.fn()}
        onEditOrder={vi.fn()}
      />,
    );
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
  });

  it('says who has access and who is only invited', () => {
    render(
      <SettingsPanel
        loadPeople={() => new Promise(() => {})}
        initialPeople={[
          { email: 'anna@example.com', pending: false },
          { email: 'bo@example.com', pending: true },
        ]}
        onInvite={vi.fn()}
        onSignOut={vi.fn()}
        onEditOrder={vi.fn()}
      />,
    );
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.getByText('bo@example.com')).toBeInTheDocument();
    // Only the pending one is marked; having access is the default.
    expect(screen.getByText('· Inbjuden')).toBeInTheDocument();
    expect(screen.queryByText('Har tillgång')).toBeNull();
  });

  it('switches the add-item bar on and off, per device', async () => {
    useUi.setState({ showQuickAdd: true });
    const { user } = setup();
    const toggle = screen.getByRole('switch', { name: 'Snabbtillägg' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(useUi.getState().showQuickAdd).toBe(false);
    expect(localStorage.getItem('storenotes.showQuickAdd')).toBe('false');
    expect(toggle).toHaveAccessibleDescription('Fältet längst ner för att lägga till varor');
    await user.click(screen.getByText('Snabbtillägg'));
    expect(useUi.getState().showQuickAdd).toBe(true);
  });

  it('switches dark mode on and off, per device', async () => {
    const { user } = setup();
    const toggle = screen.getByRole('switch', { name: 'Mörkt läge' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('storenotes.darkMode')).toBe('true');
    await user.click(toggle);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('storenotes.darkMode')).toBe('false');
  });

  it('asks to invite', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Bjud in' }));
    expect(props.onInvite).toHaveBeenCalledTimes(1);
  });

  it('opens the order editor', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ändra butikens gångar' }));
    expect(props.onEditOrder).toHaveBeenCalledTimes(1);
  });

  it('signs out', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Logga ut' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});

function setupInvite(inviteResult = true) {
  const props = {
    invite: vi.fn(async () => inviteResult),
    onInvited: vi.fn(),
    keyboardInset: 0,
  };
  render(<InviteForm {...props} />);
  return { props, user: userEvent.setup() };
}

describe('InviteForm', () => {
  it('invites a normalised email and reports it', async () => {
    const { props, user } = setupInvite();
    await user.type(screen.getByLabelText('E-post'), ' Bo@Example.com{Enter}');
    expect(props.invite).toHaveBeenCalledWith('bo@example.com');
    await waitFor(() => expect(props.onInvited).toHaveBeenCalledTimes(1));
  });

  it('rejects an invalid email', async () => {
    const { props, user } = setupInvite();
    await user.type(screen.getByLabelText('E-post'), 'bo{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Ange en giltig e-postadress.');
    expect(props.invite).not.toHaveBeenCalled();
    expect(props.onInvited).not.toHaveBeenCalled();
  });

  it('explains a failed invite', async () => {
    const { props, user } = setupInvite(false);
    await user.type(screen.getByLabelText('E-post'), 'bo@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte spara inbjudan.');
    expect(props.onInvited).not.toHaveBeenCalled();
  });
});

describe('SettingsSheet', () => {
  const open = async () => {
    const user = userEvent.setup();
    const invite = vi.fn(async () => true);
    render(<SettingsSheet loadPeople={async () => []} invite={invite} onSignOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Meny' }));
    return { user, invite };
  };

  it('moves to the invite view and back inside one sheet', async () => {
    const { user } = await open();
    await user.click(await screen.findByRole('button', { name: 'Bjud in' }));
    expect(await screen.findByLabelText('E-post')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Logga ut' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tillbaka' }));
    expect(await screen.findByRole('button', { name: 'Logga ut' })).toBeInTheDocument();
    expect(screen.queryByLabelText('E-post')).toBeNull();
  });

  it('returns to the settings after inviting', async () => {
    const { user, invite } = await open();
    await user.click(await screen.findByRole('button', { name: 'Bjud in' }));
    await user.type(await screen.findByLabelText('E-post'), 'bo@example.com{Enter}');
    expect(invite).toHaveBeenCalledWith('bo@example.com');
    expect(await screen.findByRole('button', { name: 'Logga ut' })).toBeInTheDocument();
  });

  it('always opens on the settings view', async () => {
    const { user } = await open();
    await user.click(await screen.findByRole('button', { name: 'Bjud in' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Meny' }));
    expect(await screen.findByRole('button', { name: 'Logga ut' })).toBeInTheDocument();
  });

  it('extends under the keyboard instead of floating above it', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
      configurable: true,
    });
    try {
      const { user } = await open();
      await user.click(await screen.findByRole('button', { name: 'Bjud in' }));
      await screen.findByLabelText('E-post');
      await waitFor(() => expect(screen.getByRole('dialog').style.paddingBottom).toBe('300px'));
      expect(screen.getByRole('dialog').style.bottom).toBe('');
    } finally {
      Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    }
  });

  it('keeps focus in the email field when pressing back or close', async () => {
    const { user } = await open();
    await user.click(await screen.findByRole('button', { name: 'Bjud in' }));
    const field = await screen.findByLabelText('E-post');
    for (const name of ['Tillbaka', 'Stäng']) {
      const pressed = fireEvent.mouseDown(screen.getByRole('button', { name }));
      expect(pressed).toBe(false);
    }
    expect(field).toBeInTheDocument();
  });
});
