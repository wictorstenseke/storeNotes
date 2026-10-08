import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemLine, type ItemLineProps } from './ItemLine';
import { makeItem } from '../test/factories';

function setup(overrides: Partial<ItemLineProps> = {}) {
  const props: ItemLineProps = {
    item: makeItem({ id: 'a', text: 'Milk' }),
    wantFocus: false,
    onFocused: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onEnter: vi.fn(),
    onBackspaceEmpty: vi.fn(),
    onArrow: vi.fn(),
    onExtend: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  };
  const view = render(<ItemLine {...props} />);
  const field = screen.getByRole('textbox', { name: 'Item' }) as HTMLTextAreaElement;
  return { props, field, user: userEvent.setup(), rerender: view.rerender };
}

describe('ItemLine', () => {
  it('shows the item text', () => {
    expect(setup().field.value).toBe('Milk');
  });

  it('hands the typed text to onEnter and does not insert a line break', async () => {
    const { field, props, user } = setup({ item: makeItem({ id: 'a', text: '' }) });
    await user.type(field, 'Eggs{Enter}');
    expect(props.onEnter).toHaveBeenCalledWith('Eggs');
    expect(field.value).toBe('Eggs');
  });

  it('calls onBackspaceEmpty only when the line is empty', async () => {
    const { field, props, user } = setup({ item: makeItem({ id: 'a', text: 'M' }) });
    await user.type(field, '{Backspace}');
    expect(props.onBackspaceEmpty).not.toHaveBeenCalled();
    await user.type(field, '{Backspace}');
    expect(props.onBackspaceEmpty).toHaveBeenCalledTimes(1);
  });

  it('hands the typed text to onBlur', async () => {
    const { field, props, user } = setup();
    await user.type(field, ' 2%');
    await user.tab();
    expect(props.onBlur).toHaveBeenCalledWith('Milk 2%');
  });

  it('turns pasted line breaks into spaces', async () => {
    const { field, user } = setup({ item: makeItem({ id: 'a', text: '' }) });
    await user.click(field);
    await user.paste('Milk\nEggs\r\n  Bread');
    expect(field.value).toBe('Milk Eggs Bread');
  });

  it('keeps what is being typed when the item changes underneath', async () => {
    const { field, props, user, rerender } = setup();
    await user.type(field, ' 2%');
    rerender(<ItemLine {...props} item={makeItem({ id: 'a', text: 'Mjölk' })} />);
    expect(field.value).toBe('Milk 2%');
  });

  it('takes a change from the other person while focused if nothing has been typed', async () => {
    const { field, props, user, rerender } = setup();
    await user.click(field);
    rerender(<ItemLine {...props} item={makeItem({ id: 'a', text: 'Oat milk' })} />);
    expect(field.value).toBe('Oat milk');
    await user.tab();
    expect(props.onBlur).toHaveBeenCalledWith('Oat milk');
  });

  it('takes the new text when the item changes and the line is not focused', () => {
    const { field, props, rerender } = setup();
    rerender(<ItemLine {...props} item={makeItem({ id: 'a', text: 'Mjölk' })} />);
    expect(field.value).toBe('Mjölk');
  });

  it('moves focus to the line when asked', () => {
    const { field, props } = setup({ wantFocus: true });
    expect(document.activeElement).toBe(field);
    expect(props.onFocused).toHaveBeenCalled();
  });

  it('reports arrow keys at the edges of the text', async () => {
    const { field, props, user } = setup();
    await user.click(field);
    field.setSelectionRange(field.value.length, field.value.length);
    await user.keyboard('{ArrowDown}');
    expect(props.onArrow).toHaveBeenCalledWith(1);
    field.setSelectionRange(0, 0);
    await user.keyboard('{ArrowUp}');
    expect(props.onArrow).toHaveBeenCalledWith(-1);
  });

  it('reports Shift+arrow as extending a selection, not as moving between lines', async () => {
    const { field, props, user } = setup();
    await user.click(field);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(props.onExtend).toHaveBeenCalledWith(1);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(props.onExtend).toHaveBeenCalledWith(-1);
    expect(props.onArrow).not.toHaveBeenCalled();
  });

  it('commits the text and then toggles when the checkbox is tapped while editing', async () => {
    const { field, props, user } = setup();
    await user.type(field, '!');
    await user.click(screen.getByRole('checkbox'));
    expect(props.onBlur).toHaveBeenCalledWith('Milk!');
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});
