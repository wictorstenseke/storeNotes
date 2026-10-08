import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Category } from '../domain/categories';
import { sortOpen } from '../domain/sort';
import { STORES } from '../domain/stores';
import { NoteStoreProvider } from '../state/context';
import type { NoteActions, NoteState } from '../state/noteStore';
import { useUi } from '../state/uiStore';
import { makeStore } from '../test/helpers';
import { NoteView } from './NoteView';

beforeEach(() => {
  useUi.setState({ focusId: null, hold: null, storeId: null, quickAddSectionId: null });
});

async function setup(seed?: (note: NoteState & NoteActions, sectionId: string) => void) {
  const { store } = await makeStore();
  const sectionId = store.getState().addSection('Grocery List');
  store.getState().setStoreSort(sectionId, true);
  seed?.(store.getState(), sectionId);
  render(
    <NoteStoreProvider value={store}>
      <NoteView />
    </NoteStoreProvider>,
  );
  return { store, sectionId, user: userEvent.setup() };
}

// The store is chosen in the section's ⋯ menu.
async function chooseStore(user: ReturnType<typeof userEvent.setup>, name: string, section = 'Grocery List') {
  await user.click(screen.getByRole('button', { name: `Options for ${section}` }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

const fields = () => screen.queryAllByRole('textbox', { name: 'Item' }) as HTMLTextAreaElement[];
const lines = () => fields().map((el) => el.value);
const seedAC = (note: NoteState & NoteActions, sectionId: string) => {
  note.addItems(sectionId, ['A', 'C']);
};

describe('editing', () => {
  it('shows items in manual order', async () => {
    await setup(seedAC);
    expect(lines()).toEqual(['A', 'C']);
  });

  it('opens a focused line below on Enter and keeps what is typed there', async () => {
    const { store, user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    expect(lines()).toEqual(['A', '', 'C']);
    expect(document.activeElement).toBe(fields()[1]);
    await user.keyboard('B');
    await user.tab();
    expect(lines()).toEqual(['A', 'B', 'C']);
    expect(sortOpen(store.getState().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('deletes an empty line on Backspace and focuses the line above', async () => {
    const { user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['A', 'C']);
    expect(document.activeElement).toBe(fields()[0]);
  });

  it('removes an empty line when it loses focus', async () => {
    const { store, user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    await user.click(screen.getByRole('textbox', { name: 'Section title' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(store.getState().items).toHaveLength(2);
  });

  it('starts a new line at the end when the space under the list is tapped', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('button', { name: 'Add item to Grocery List' }));
    expect(document.activeElement).toBe(fields()[2]);
    await user.keyboard('Z');
    await user.tab();
    expect(sortOpen(store.getState().items, null).map((i) => i.text)).toEqual(['A', 'C', 'Z']);
  });

  it('moves focus between lines with the arrow keys', async () => {
    const { user } = await setup(seedAC);
    await user.click(fields()[0]);
    fields()[0].setSelectionRange(1, 1);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(fields()[1]);
  });
});

describe('checking off', () => {
  it('moves a checked item to Done and back when the Done item is tapped', async () => {
    const { user } = await setup(seedAC);
    await user.click(screen.getByRole('checkbox', { name: 'Check A' }));
    expect(lines()).toEqual(['C']);
    await user.click(screen.getByRole('checkbox', { name: 'Uncheck A' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(screen.queryByRole('checkbox', { name: 'Uncheck A' })).toBeNull();
  });

  it('clears Done items', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('checkbox', { name: 'Check A' }));
    await user.click(screen.getByRole('button', { name: 'Clear done' }));
    expect(store.getState().items.map((i) => i.text)).toEqual(['C']);
    expect(screen.queryByRole('button', { name: 'Clear done' })).toBeNull();
  });
});

describe('store order', () => {
  const STORE_NAMES = STORES.map((store) => store.name);
  // Written against whatever the first store is, so the tests still hold when
  // Task 15 replaces the example stores with the real ones.
  const STORE = STORES[0];
  const TAGGED: [string, Category][] = [
    ['Ice', 'frozen'],
    ['Milk', 'dairy'],
    ['Apple', 'produce'],
  ];
  const inStoreOrder = [...TAGGED]
    .sort((a, b) => STORE.baseline.indexOf(a[1]) - STORE.baseline.indexOf(b[1]))
    .map(([text]) => text);

  const seedTagged = (note: NoteState & NoteActions, sectionId: string) => {
    const [ice, milk, , apple] = note.addItems(sectionId, ['Ice', 'Milk', 'New', 'Apple']);
    note.setCategory(ice, 'frozen', 'Ice');
    note.setCategory(milk, 'dairy', 'Milk');
    note.setCategory(apple, 'produce', 'Apple');
  };

  it('sorts by the chosen store and returns to manual order with No store', async () => {
    const { user } = await setup(seedTagged);
    expect(lines()).toEqual(['Ice', 'Milk', 'New', 'Apple']);
    const grocery = screen.getByRole('region', { name: 'Grocery List' });
    expect(within(grocery).queryByText(STORE.name)).toBeNull();
    await chooseStore(user, STORE.name);
    expect(lines()).toEqual(['New', ...inStoreOrder]);
    // The chosen store is named beside the menu button, since the menu is closed.
    expect(within(grocery).getByText(STORE.name)).toBeInTheDocument();
    await chooseStore(user, 'No store');
    expect(lines()).toEqual(['Ice', 'Milk', 'New', 'Apple']);
    expect(within(grocery).queryByText(STORE.name)).toBeNull();
  });

  it('records the chosen store on a checked item', async () => {
    const { store, user } = await setup(seedTagged);
    await chooseStore(user, STORE.name);
    await user.click(screen.getByRole('checkbox', { name: 'Check Milk' }));
    expect(store.getState().items.find((i) => i.text === 'Milk')?.checked_store).toBe(STORE.id);
  });

  it('offers stores only in the menu of a section with store sort on', async () => {
    const { store, user } = await setup(seedAC);
    act(() => {
      store.getState().addSection('Gifts');
    });
    await user.click(screen.getByRole('button', { name: 'Options for Gifts' }));
    await screen.findByRole('menuitemcheckbox', { name: 'Sort by store' });
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Options for Grocery List' }));
    expect(await screen.findByRole('menuitemradio', { name: STORE_NAMES[0] })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: STORE_NAMES[1] })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'No store' })).toBeInTheDocument();
  });

  it('has no row of store buttons under the section title', async () => {
    await setup(seedAC);
    expect(screen.queryByRole('group', { name: 'Store' })).toBeNull();
  });
});

describe('sections', () => {
  it('adds a section and focuses its title', async () => {
    const { store, user } = await setup();
    await user.click(screen.getByRole('button', { name: '+ New section' }));
    expect(store.getState().sections).toHaveLength(2);
    const titles = screen.getAllByRole('textbox', { name: 'Section title' });
    expect(document.activeElement).toBe(titles[1]);
    await user.keyboard('Gifts');
    await user.tab();
    expect(store.getState().sections.map((s) => s.title)).toContain('Gifts');
  });
});
describe('reordering', () => {
  const rows = () => Array.from(document.querySelectorAll('[data-draggable]'));

  it('allows dragging in manual order only', async () => {
    const { user } = await setup(seedAC);
    expect(rows()).toHaveLength(2);
    expect(rows().every((row) => row.getAttribute('data-draggable') === 'true')).toBe(true);
    await chooseStore(user, STORES[0].name);
    expect(rows().every((row) => row.getAttribute('data-draggable') === 'false')).toBe(true);
  });
});
