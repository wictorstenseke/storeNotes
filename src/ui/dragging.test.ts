import { afterEach, describe, expect, it } from 'vitest';
import { setDragging } from './dragging';

const root = document.documentElement;

afterEach(() => setDragging(false));

describe('dragging', () => {
  const tryTo = (type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented ? 'blocked' : 'allowed';
  };

  it('marks the page while something is dragged', () => {
    setDragging(true);
    expect(root).toHaveAttribute('data-dragging');
    setDragging(false);
    expect(root).not.toHaveAttribute('data-dragging');
  });

  it('drops any text selection when a drag starts', () => {
    document.body.innerHTML = '<p>Mjölk</p>';
    window.getSelection()!.selectAllChildren(document.body);
    expect(window.getSelection()!.toString()).toBe('Mjölk');
    setDragging(true);
    expect(window.getSelection()!.toString()).toBe('');
  });

  it('blocks text selection and the long-press menu only during a drag', () => {
    expect(tryTo('selectstart')).toBe('allowed');
    setDragging(true);
    expect(tryTo('selectstart')).toBe('blocked');
    expect(tryTo('contextmenu')).toBe('blocked');
    setDragging(false);
    expect(tryTo('selectstart')).toBe('allowed');
    expect(tryTo('contextmenu')).toBe('allowed');
  });
});
