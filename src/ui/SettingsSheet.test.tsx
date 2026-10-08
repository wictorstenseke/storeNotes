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
    await user.type(screen.getByLabelText('Share with'), ' Bo@Example.com{Enter}');
    expect(props.invite).toHaveBeenCalledWith('bo@example.com');
    expect(await screen.findByText('bo@example.com')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByLabelText('Share with')).toHaveValue('');
  });

  it('rejects an invalid email', async () => {
    const { props, user } = setup();
    await user.type(screen.getByLabelText('Share with'), 'bo{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(props.invite).not.toHaveBeenCalled();
  });

  it('explains a failed invite', async () => {
    const { user } = setup(false);
    await user.type(screen.getByLabelText('Share with'), 'bo@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the invite.');
  });

  it('signs out', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});
