import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SectionMenu } from './SectionMenu';

function setup(storeSort = false) {
  const props = { title: 'Gifts', storeSort, onStoreSort: vi.fn(), onDelete: vi.fn() };
  render(<SectionMenu {...props} />);
  return { props, user: userEvent.setup() };
}

const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Options for Gifts' }));

describe('SectionMenu', () => {
  it('turns store sort on', async () => {
    const { props, user } = setup(false);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sort by store' }));
    expect(props.onStoreSort).toHaveBeenCalledWith(true);
  });

  it('turns store sort off', async () => {
    const { props, user } = setup(true);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sort by store' }));
    expect(props.onStoreSort).toHaveBeenCalledWith(false);
  });

  it('asks before deleting and deletes on confirm', async () => {
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete section' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete this section?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not delete on cancel', async () => {
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete section' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
