import { useEffect, useState } from 'react';

// On iPhone a fixed bar at the bottom ends up behind the keyboard. The visual
// viewport tells us how much of the layout viewport the keyboard covers.
// offsetTop goes negative during iOS rubber-band overscroll at the top; that is
// not the keyboard, so it is clamped to 0.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    // The keyboard only exists while a field has focus. Without this gate, iOS
    // viewport quirks (collapsing toolbars, overscroll) read as a phantom keyboard.
    const typing = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const update = () =>
      setInset(
        typing()
          ? Math.max(0, Math.round(window.innerHeight - viewport.height - Math.max(0, viewport.offsetTop)))
          : 0,
      );
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

  return inset;
}
