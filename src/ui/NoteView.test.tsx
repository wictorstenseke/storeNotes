import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { SettingsSheet } from './SettingsSheet';

beforeEach(() => {
  useUi.setState({
    focusId: null,
    hold: null,
    storeId: null,
    quickAddSectionId: null,
    selection: null,
    orderEditorStore: null,
  });
});

async function setup(
  seed?: (note: NoteState & NoteActions, sectionId: string) => void,
  withSettings = false,
) {
  const { store } = await makeStore();
  const sectionId = store.getState().addSection('Grocery List');
  store.getState().setStoreSort(sectionId, true);
  seed?.(store.getState(), sectionId);
  render(
    <NoteStoreProvider value={store}>
      <NoteView
        header={
          withSettings ? (
            <SettingsSheet loadPeople={async () => []} invite={async () => true} onSignOut={() => {}} />
          ) : undefined
        }
      />
    </NoteStoreProvider>,
  );
  return { store, sectionId, user: userEvent.setup() };
}

// The store is chosen in the section's ⋯ menu.
async function chooseStore(user: ReturnType<typeof userEvent.setup>, name: string, section = 'Grocery List') {
  await user.click(screen.getByRole('button', { name: `Alternativ för ${section}` }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

const fields = () => screen.queryAllByRole('textbox', { name: 'Vara' }) as HTMLTextAreaElement[];
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
    await user.click(screen.getByRole('textbox', { name: 'Sektionens namn' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(store.getState().items).toHaveLength(2);
  });

  it('starts a new line at the end when the space under the list is tapped', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('button', { name: 'Lägg till vara i Grocery List' }));
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
    await user.click(screen.getByRole('checkbox', { name: 'Markera A' }));
    expect(lines()).toEqual(['C']);
    await user.click(screen.getByRole('checkbox', { name: 'Avmarkera A' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(screen.queryByRole('checkbox', { name: 'Avmarkera A' })).toBeNull();
  });

  it('clears Done items', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('checkbox', { name: 'Markera A' }));
    await user.click(screen.getByRole('button', { name: 'Rensa klara' }));
    expect(store.getState().items.map((i) => i.text)).toEqual(['C']);
    expect(screen.queryByRole('button', { name: 'Rensa klara' })).toBeNull();
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
    await chooseStore(user, 'Ingen butik');
    expect(lines()).toEqual(['Ice', 'Milk', 'New', 'Apple']);
    expect(within(grocery).queryByText(STORE.name)).toBeNull();
  });

  it('records the chosen store on a checked item', async () => {
    const { store, user } = await setup(seedTagged);
    await chooseStore(user, STORE.name);
    await user.click(screen.getByRole('checkbox', { name: 'Markera Milk' }));
    expect(store.getState().items.find((i) => i.text === 'Milk')?.checked_store).toBe(STORE.id);
  });

  it('offers stores only in the menu of a section with store sort on', async () => {
    const { store, user } = await setup(seedAC);
    act(() => {
      store.getState().addSection('Gifts');
    });
    await user.click(screen.getByRole('button', { name: 'Alternativ för Gifts' }));
    await screen.findByRole('menuitemcheckbox', { name: 'Sortera efter butik' });
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Alternativ för Grocery List' }));
    expect(await screen.findByRole('menuitemradio', { name: STORE_NAMES[0] })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: STORE_NAMES[1] })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Ingen butik' })).toBeInTheDocument();
  });

  it('has no row of store buttons under the section title', async () => {
    await setup(seedAC);
    expect(screen.queryByRole('group', { name: 'Butik' })).toBeNull();
  });
});

describe('sections', () => {
  it('adds a section and focuses its title', async () => {
    const { store, user } = await setup();
    await user.click(screen.getByRole('button', { name: '+ Ny sektion' }));
    expect(store.getState().sections).toHaveLength(2);
    const titles = screen.getAllByRole('textbox', { name: 'Sektionens namn' });
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

describe('selecting several items', () => {
  const seedABCD = (note: NoteState & NoteActions, sectionId: string) => {
    note.addItems(sectionId, ['A', 'B', 'C', 'D']);
  };
  const row = (text: string) =>
    fields().find((el) => el.value === text)!.closest('[data-draggable]') as HTMLElement;
  const selected = () =>
    fields()
      .filter((el) => el.closest('[data-selected="true"]'))
      .map((el) => el.value);

  it('selects a range with Shift-click and deletes it with one Backspace', async () => {
    const { store, user } = await setup(seedABCD);
    await user.click(fields()[0]);
    await user.keyboard('{Shift>}');
    await user.click(row('C'));
    await user.keyboard('{/Shift}');
    expect(selected()).toEqual(['A', 'B', 'C']);
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['D']);
    expect(store.getState().items.map((i) => i.text)).toEqual(['D']);
    expect(selected()).toEqual([]);
  });

  it('selects, without putting the cursor in a line, when the text itself is Shift- or Cmd-clicked', async () => {
    const { user } = await setup(seedABCD);
    await user.click(fields()[0]);
    await user.keyboard('{Shift>}');
    await user.click(fields()[2]);
    await user.keyboard('{/Shift}');
    expect(selected()).toEqual(['A', 'B', 'C']);
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');
    await user.keyboard('{Meta>}');
    await user.click(fields()[3]);
    await user.keyboard('{/Meta}');
    expect(selected()).toEqual(['A', 'B', 'C', 'D']);
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual([]);
  });

  it('adds and removes single lines with Cmd-click and deletes with Delete', async () => {
    const { user } = await setup(seedABCD);
    await user.keyboard('{Meta>}');
    await user.click(row('A'));
    await user.click(row('C'));
    expect(selected()).toEqual(['A', 'C']);
    await user.click(row('A'));
    await user.keyboard('{/Meta}');
    expect(selected()).toEqual(['C']);
    await user.keyboard('{Delete}');
    expect(lines()).toEqual(['A', 'B', 'D']);
  });

  it('extends and shrinks the selection with Shift and the arrow keys', async () => {
    const { user } = await setup(seedABCD);
    await user.click(fields()[0]);
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selected()).toEqual(['A', 'B', 'C']);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(selected()).toEqual(['A', 'B']);
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['C', 'D']);
  });

  it('selects the lines the mouse is dragged across', async () => {
    const { user } = await setup(seedABCD);
    fireEvent.mouseDown(row('B'), { button: 0 });
    fireEvent.mouseEnter(row('C'), { buttons: 1 });
    fireEvent.mouseEnter(row('D'), { buttons: 1 });
    fireEvent.mouseUp(window);
    expect(selected()).toEqual(['B', 'C', 'D']);
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['A']);
  });

  it('does not select when the mouse only moves over lines without a button held', async () => {
    await setup(seedABCD);
    fireEvent.mouseDown(row('B'), { button: 0 });
    fireEvent.mouseUp(window);
    fireEvent.mouseEnter(row('C'), { buttons: 0 });
    expect(selected()).toEqual([]);
  });

  it('clears the selection with Escape without deleting anything', async () => {
    const { user } = await setup(seedABCD);
    await user.click(fields()[0]);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(selected()).toEqual(['A', 'B']);
    await user.keyboard('{Escape}');
    expect(selected()).toEqual([]);
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('clears the selection on an ordinary click and edits as usual', async () => {
    const { user } = await setup(seedABCD);
    await user.click(fields()[0]);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await user.click(fields()[3]);
    expect(selected()).toEqual([]);
    await user.keyboard('!');
    await user.tab();
    expect(lines()).toEqual(['A', 'B', 'C', 'D!']);
  });

  it('keeps a selection inside one section', async () => {
    const { store, user } = await setup(seedABCD);
    act(() => {
      const gifts = store.getState().addSection('Gifts');
      store.getState().addItems(gifts, ['Lego']);
    });
    await user.keyboard('{Meta>}');
    await user.click(row('A'));
    await user.click(row('Lego'));
    await user.keyboard('{/Meta}');
    expect(selected()).toEqual(['Lego']);
  });
});

describe('editing the store order', () => {
  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Inställningar' }));
    await user.click(await screen.findByRole('button', { name: 'Editera ordningen' }));
    return screen.findByRole('dialog', { name: 'Butikens ordning' });
  };

  it('opens for the first store when no store is chosen', async () => {
    const { user } = await setup(seedAC, true);
    const dialog = await openEditor(user);
    expect(within(dialog).getByRole('button', { name: STORES[0].name })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens for the store that is chosen', async () => {
    const { user } = await setup(seedAC, true);
    await chooseStore(user, STORES[1].name);
    const dialog = await openEditor(user);
    expect(within(dialog).getByRole('button', { name: STORES[1].name })).toHaveAttribute('aria-pressed', 'true');
  });
});
