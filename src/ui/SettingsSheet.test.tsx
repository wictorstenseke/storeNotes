import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPanel, type Person } from './SettingsSheet';

function setup(inviteResult = true) {
  const people: Person[] = [{ email: 'anna@example.com', pending: false }];
  const props = {
    loadPeople: vi.fn(async () => [...people]),
    invite: vi.fn(async (email: string) => {
      if (inviteResult) people.push({ email, pending: true });
      return inviteResult;
    }),
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

  it('shows the invite form only in its own sheet', async () => {
    const { user } = setup();
    expect(screen.queryByLabelText('E-post')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Bjud in' }));
    expect(await screen.findByLabelText('E-post')).toBeInTheDocument();
  });

  it('invites a normalised email, closes the sheet and shows it as pending', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Bjud in' }));
    await user.type(await screen.findByLabelText('E-post'), ' Bo@Example.com{Enter}');
    expect(props.invite).toHaveBeenCalledWith('bo@example.com');
    await waitFor(() => expect(screen.queryByLabelText('E-post')).toBeNull());
    expect(await screen.findByText('bo@example.com')).toBeInTheDocument();
    expect(screen.getByText('Inbjuden')).toBeInTheDocument();
  });

  it('rejects an invalid email and keeps the sheet open', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Bjud in' }));
    await user.type(await screen.findByLabelText('E-post'), 'bo{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Ange en giltig e-postadress.');
    expect(props.invite).not.toHaveBeenCalled();
  });

  it('explains a failed invite', async () => {
    const { user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Bjud in' }));
    await user.type(await screen.findByLabelText('E-post'), 'bo@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte spara inbjudan.');
    expect(screen.getByLabelText('E-post')).toBeInTheDocument();
  });

  it('shows already known people without waiting for the load', () => {
    render(
      <SettingsPanel
        loadPeople={() => new Promise(() => {})}
        initialPeople={[{ email: 'anna@example.com', pending: false }]}
        invite={vi.fn()}
        onSignOut={vi.fn()}
        onEditOrder={vi.fn()}
      />,
    );
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
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
