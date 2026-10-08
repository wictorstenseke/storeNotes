import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteBanner, type Invite } from './InviteBanner';

const INVITE: Invite = { list_id: 'list-9', invited_by: 'anna@example.com' };

function setup(invites: Invite[] | Error = [INVITE]) {
  const props = {
    loadInvites: vi.fn(async () => {
      if (invites instanceof Error) throw invites;
      return invites;
    }),
    onAccept: vi.fn(),
    onDecline: vi.fn(async () => true),
  };
  const view = render(<InviteBanner {...props} />);
  return { props, user: userEvent.setup(), container: view.container };
}

describe('InviteBanner', () => {
  it('shows nothing when there are no invites', async () => {
    const { props, container } = setup([]);
    await vi.waitFor(() => expect(props.loadInvites).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when invites cannot be loaded', async () => {
    const { props, container } = setup(new Error('offline'));
    await vi.waitFor(() => expect(props.loadInvites).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says who invited and that joining replaces the list on this device', async () => {
    setup();
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('anna@example.com invited you to share their list.');
    expect(banner).toHaveTextContent('Joining replaces the list on this device.');
  });

  it('joins only when Join is tapped', async () => {
    const { props, user } = setup();
    await screen.findByRole('status');
    expect(props.onAccept).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(props.onAccept).toHaveBeenCalledWith('list-9');
  });

  it('declines and hides the invite', async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(props.onDecline).toHaveBeenCalledWith('list-9');
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(props.onAccept).not.toHaveBeenCalled();
  });
});
