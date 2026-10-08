import { render, screen } from '@testing-library/react';
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

  it('invites a normalised email and shows it as pending', async () => {
    const { props, user } = setup();
    await user.type(screen.getByLabelText('Dela med'), ' Bo@Example.com{Enter}');
    expect(props.invite).toHaveBeenCalledWith('bo@example.com');
    expect(await screen.findByText('bo@example.com')).toBeInTheDocument();
    expect(screen.getByText('Inbjuden')).toBeInTheDocument();
    expect(screen.getByLabelText('Dela med')).toHaveValue('');
  });

  it('rejects an invalid email', async () => {
    const { props, user } = setup();
    await user.type(screen.getByLabelText('Dela med'), 'bo{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Ange en giltig e-postadress.');
    expect(props.invite).not.toHaveBeenCalled();
  });

  it('explains a failed invite', async () => {
    const { user } = setup(false);
    await user.type(screen.getByLabelText('Dela med'), 'bo@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte spara inbjudan.');
  });

  it('opens the order editor', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Editera ordningen' }));
    expect(props.onEditOrder).toHaveBeenCalledTimes(1);
  });

  it('signs out', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Logga ut' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});
