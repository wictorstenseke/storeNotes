import { useEffect, useState } from 'react';

type Keyboard = {
  // How much of the layout viewport the keyboard covers.
  inset: number;
  // Where the visible area starts and how tall it is, with the keyboard up.
  top: number;
  height: number;
};

const CLOSED: Keyboard = { inset: 0, top: 0, height: 0 };

// On iPhone the keyboard covers the page and iOS pans or scrolls it to reveal the
// focused field. The visual viewport tells us what is actually visible.
// offsetTop goes negative during iOS rubber-band overscroll at the top; that is
// not the keyboard, so it is clamped to 0.
export function useKeyboard(): Keyboard {
  const [keyboard, setKeyboard] = useState(CLOSED);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    // The keyboard only exists while a field has focus. Without this gate, iOS
    // viewport quirks (collapsing toolbars, overscroll) read as a phantom keyboard.
    const typing = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const update = () => {
      const top = Math.max(0, Math.round(viewport.offsetTop));
      const height = Math.round(viewport.height);
      const inset = typing() ? Math.max(0, Math.round(window.innerHeight - height - top)) : 0;
      const next = inset > 0 ? { inset, top, height } : CLOSED;
      setKeyboard((prev) =>
        prev.inset === next.inset && prev.top === next.top && prev.height === next.height ? prev : next,
      );
    };
    // activeElement has not moved yet while focusout fires.
    const deferred = () => setTimeout(update, 0);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', deferred);
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', deferred);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return keyboard;
}

export function useKeyboardInset(): number {
  return useKeyboard().inset;
}
