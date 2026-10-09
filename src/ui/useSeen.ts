import { useEffect, useState } from 'react';

// True once the element has been on screen with the app in front.
export function useSeen(node: Element | null, enabled: boolean): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setSeen(false);
      return;
    }
    if (!node || seen) return;
    // Without the observer (old browsers) every line counts as on screen.
    let onScreen = typeof IntersectionObserver === 'undefined';
    const check = () => {
      if (onScreen && document.visibilityState === 'visible') setSeen(true);
    };
    const observer = onScreen
      ? null
      : new IntersectionObserver((entries) => {
          onScreen = entries[entries.length - 1].isIntersecting;
          check();
        });
    observer?.observe(node);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', check);
    };
  }, [node, enabled, seen]);
  return enabled && seen;
}
