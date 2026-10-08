import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sortOpen } from '../domain/sort';
import { NoteStoreProvider } from '../state/context';
import { readSetting } from '../state/deviceSettings';
import { useUi } from '../state/uiStore';
import { makeStore } from '../test/helpers';
import { QuickAddBar } from './QuickAddBar';

beforeEach(() => {
  useUi.setState({ focusId: null, hold: null, storeId: null, quickAddSectionId: null });
});

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
});

async function setup(sectionTitles = ['Grocery List', 'Gifts']) {
  const { store } = await makeStore();
  const sectionIds = sectionTitles.map((title) => store.getState().addSection(title));
  const view = render(
    <NoteStoreProvider value={store}>
      <QuickAddBar />
    </NoteStoreProvider>,
  );
  const textsIn = (sectionId: string) =>
    sortOpen(store.getState().items.filter((i) => i.section_id === sectionId), null).map((i) => i.text);
  return { store, sectionIds, textsIn, user: userEvent.setup(), container: view.container };
}

const field = () => screen.getByRole('textbox', { name: 'Add item' }) as HTMLTextAreaElement;

describe('QuickAddBar', () => {
  it('adds on Enter, clears the field and keeps focus', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.type(field(), 'Milk{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk']);
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
    await user.keyboard('Eggs{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk', 'Eggs']);
  });

  it('adds one item per comma or line break', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.click(field());
    await user.paste('Milk, Eggs\nBread');
    await user.keyboard('{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk', 'Eggs', 'Bread']);
  });

  it('adds nothing for whitespace', async () => {
    const { store, user } = await setup();
    await user.type(field(), '   {Enter}');
    expect(store.getState().items).toEqual([]);
  });

  it('adds with the + button and keeps focus in the field', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.type(field(), 'Milk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(textsIn(sectionIds[0])).toEqual(['Milk']);
    expect(document.activeElement).toBe(field());
  });

  it('switches target section with the chip and remembers the last one used', async () => {
    const { textsIn, sectionIds, user } = await setup();
    const chip = () => screen.getByRole('button', { name: /^Adding to/ });
    expect(chip()).toHaveTextContent('Grocery List');
    await user.click(chip());
    expect(chip()).toHaveTextContent('Gifts');
    await user.type(field(), 'Lego{Enter}');
    expect(textsIn(sectionIds[1])).toEqual(['Lego']);
    expect(readSetting('quickAddSectionId')).toBe(sectionIds[1]);
    await user.click(chip());
    expect(chip()).toHaveTextContent('Grocery List');
  });

  it('renders nothing when there are no sections', async () => {
    const { container } = await setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('sits above the on-screen keyboard', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
      configurable: true,
    });
    const { container } = await setup();
    expect((container.firstElementChild as HTMLElement).style.bottom).toBe('300px');
  });
});
