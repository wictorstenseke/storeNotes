export function parseQuickAdd(text: string): string[] {
  return text
    .split(/[,\n\r]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}
