import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../domain/categories';
import { CATEGORY_LABELS } from '../domain/categoryLabels';
import { effectiveOrder } from '../domain/learning';
import { STORES } from '../domain/stores';
import { NoteStoreProvider } from '../state/context';
import { makeStore } from '../test/helpers';
import { StoreOrderList, StoreOrderPanel } from './StoreOrder';

const labels = () =>
  screen.getAllByRole('listitem').map((row) => within(row).getByTestId('category-label').textContent);
const handle = (category: Category) =>
  screen.getByRole('button', { name: `Flytta ${CATEGORY_LABELS[category].name}` });

describe('StoreOrderList', () => {
  const ORDER: Category[] = ['produce', 'bakery', 'dairy'];

  it('lists the categories by their Swedish names, numbered, in order', () => {
    render(<StoreOrderList order={ORDER} onChange={vi.fn()} />);
    expect(labels()).toEqual(['Frukt & grönt', 'Bröd', 'Mejeri']);
    expect(screen.getAllByRole('listitem').map((row) => row.textContent?.trim().charAt(0))).toEqual(['1', '2', '3']);
  });

  it('moves a category down and up with the arrow keys on its handle', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StoreOrderList order={ORDER} onChange={onChange} />);
    handle('produce').focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(['bakery', 'produce', 'dairy']);
    handle('dairy').focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(['produce', 'dairy', 'bakery']);
  });

  it('does nothing at the ends of the list', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StoreOrderList order={ORDER} onChange={onChange} />);
    handle('produce').focus();
    await user.keyboard('{ArrowUp}');
    handle('dairy').focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StoreOrderPanel', () => {
  const [FIRST, SECOND] = STORES;

  async function setup(storeId = FIRST.id) {
    const { store } = await makeStore();
    const onStore = vi.fn();
    const view = render(
      <NoteStoreProvider value={store}>
        <StoreOrderPanel storeId={storeId} onStore={onStore} />
      </NoteStoreProvider>,
    );
    const scores = (id: string) => store.getState().storeOrders.find((o) => o.store_id === id)?.scores;
    return { store, onStore, scores, user: userEvent.setup(), rerender: view.rerender };
  }

  const names = (order: Category[]) => order.map((category) => CATEGORY_LABELS[category].name);

  it('shows the store order as the app currently uses it', async () => {
    await setup();
    expect(labels()).toEqual(names(FIRST.baseline));
  });

  it('saves a move at once and shows the new order', async () => {
    const { scores, user } = await setup();
    const [first, second, ...rest] = FIRST.baseline;
    handle(first).focus();
    await user.keyboard('{ArrowDown}');
    const moved = [second, first, ...rest];
    expect(labels()).toEqual(names(moved));
    expect(effectiveOrder(FIRST.baseline, scores(FIRST.id))).toEqual(moved);
    expect(scores(SECOND.id)).toBeUndefined();
  });

  it('keeps the keyboard on the category that was moved', async () => {
    const { user } = await setup();
    const first = FIRST.baseline[0];
    handle(first).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(handle(first));
    expect(labels()[2]).toBe(CATEGORY_LABELS[first].name);
  });

  it('asks to switch store when the other store is tapped', async () => {
    const { onStore, user } = await setup();
    expect(screen.getByRole('button', { name: FIRST.name })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: SECOND.name }));
    expect(onStore).toHaveBeenCalledWith(SECOND.id);
  });

  it('shows the other store with its own order', async () => {
    await setup(SECOND.id);
    expect(labels()).toEqual(names(SECOND.baseline));
  });

  it('goes back to the original order with Reset', async () => {
    const { scores, user } = await setup();
    handle(FIRST.baseline[0]).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('button', { name: 'Återställ ursprunglig ordning' }));
    expect(labels()).toEqual(names(FIRST.baseline));
    expect(effectiveOrder(FIRST.baseline, scores(FIRST.id))).toEqual(FIRST.baseline);
  });
});
