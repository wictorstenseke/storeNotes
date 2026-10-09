import type { Item, Section } from './types';
import { byManual } from './sort';

// The open items of every list as plain text, for the share sheet.
export function listAsText(sections: Section[], items: Item[]): string {
  return [...sections]
    .sort(byManual)
    .map((section) => {
      const open = items
        .filter((item) => item.section_id === section.id && !item.checked)
        .sort(byManual)
        .map((item) => `- ${item.text}`);
      return [section.title || 'Namnlös', ...open].join('\n');
    })
    .join('\n\n');
}
