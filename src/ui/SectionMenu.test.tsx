import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STORES } from '../domain/stores';
import { SectionMenu } from './SectionMenu';

function setup(storeSort = false, storeId: string | null = null) {
  const props = {
    title: 'Gifts',
    storeSort,
    storeId,
    onStore: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<SectionMenu {...props} />);
  return { props, user: userEvent.setup() };
}

const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Alternativ för Gifts' }));

describe('SectionMenu', () => {
  it('reports the chosen store', async () => {
    const { props, user } = setup(false);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitemradio', { name: STORES[1].name }));
    expect(props.onStore).toHaveBeenCalledWith(STORES[1].id);
  });

  it('reports No store as no store', async () => {
    const { props, user } = setup(true, STORES[0].id);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Ingen butik' }));
    expect(props.onStore).toHaveBeenCalledWith(null);
  });

  it('marks the chosen store', async () => {
    const { user } = setup(true, STORES[0].id);
    await openMenu(user);
    expect(await screen.findByRole('menuitemradio', { name: STORES[0].name })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Ingen butik' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows No store as chosen when store sort is off', async () => {
    const { user } = setup(false, STORES[0].id);
    await openMenu(user);
    expect(await screen.findByRole('menuitemradio', { name: 'Ingen butik' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: STORES[0].name })).toHaveAttribute('aria-checked', 'false');
  });

  it('asks before deleting and deletes on confirm', async () => {
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Ta bort lista' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(await screen.findByText('Ta bort listan?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ta bort' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not delete on cancel', async () => {
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Ta bort lista' }));
    await user.click(await screen.findByRole('button', { name: 'Avbryt' }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
