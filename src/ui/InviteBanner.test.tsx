import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteBanner, type Invite, type Keepable } from './InviteBanner';

const INVITE: Invite = { list_id: 'list-9', invited_by: 'anna@example.com' };

const MAT: Keepable = { id: 's-mat', title: 'Mat', items: 3 };
const TOM: Keepable = { id: 's-tom', title: 'Tom', items: 0 };

function setup(invites: Invite[] | Error = [INVITE], sections: Keepable[] = [MAT, TOM]) {
  const props = {
    loadInvites: vi.fn(async () => {
      if (invites instanceof Error) throw invites;
      return invites;
    }),
    sections,
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

  it('says who invited and that joining switches lists', async () => {
    setup();
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('anna@example.com har bjudit in dig att dela sin lista.');
    expect(banner).toHaveTextContent('Du väljer själv vilka av dina sektioner som följer med.');
  });

  it('asks which sections to take along, with those holding items ticked', async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Gå med' }));
    expect(props.onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Mat/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Tom/ })).not.toBeChecked();
  });

  it('joins with the chosen sections', async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Gå med' }));
    await user.click(screen.getByRole('checkbox', { name: /Tom/ }));
    await user.click(screen.getByRole('checkbox', { name: /Mat/ }));
    await user.click(screen.getByRole('button', { name: 'Gå med' }));
    expect(props.onAccept).toHaveBeenCalledWith('list-9', ['s-tom']);
  });

  it('can go back without joining', async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Gå med' }));
    await user.click(screen.getByRole('button', { name: 'Tillbaka' }));
    expect(props.onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Avböj' })).toBeInTheDocument();
  });

  it('joins at once when there is nothing to take along', async () => {
    const { props, user } = setup([INVITE], []);
    await user.click(await screen.findByRole('button', { name: 'Gå med' }));
    expect(props.onAccept).toHaveBeenCalledWith('list-9', []);
  });

  it('declines and hides the invite', async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Avböj' }));
    expect(props.onDecline).toHaveBeenCalledWith('list-9');
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(props.onAccept).not.toHaveBeenCalled();
  });
});
