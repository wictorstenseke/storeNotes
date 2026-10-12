const block = (event: Event) => event.preventDefault();

// Holding a line is also how a phone starts selecting its text. While something
// is dragged nothing on the page can be selected (index.css turns it off for
// every element) and the long-press menu stays away.
export function setDragging(active: boolean): void {
  const root = document.documentElement;
  if (active) {
    root.dataset.dragging = '';
    window.getSelection()?.removeAllRanges();
    document.addEventListener('selectstart', block);
    document.addEventListener('contextmenu', block);
  } else {
    delete root.dataset.dragging;
    document.removeEventListener('selectstart', block);
    document.removeEventListener('contextmenu', block);
  }
}
