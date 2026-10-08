import { isCategory, type Category } from '../domain/categories';
import type { NoteStore } from '../state/noteStore';

export type CategorizeCall = (texts: string[]) => Promise<Record<string, Category>>;

const BATCH = 50;

export class Categorizer {
  private running = false;

  constructor(
    private call: CategorizeCall,
    private note: Pick<NoteStore, 'getState'>,
  ) {}

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { items, sections } = this.note.getState();
      // Only sections sorted by store need categories. Everything else stays
      // on the device.
      const sorted = new Set(sections.filter((s) => s.store_sort).map((s) => s.id));
      const untagged = items.filter(
        (i) => i.category === null && i.text.trim() !== '' && sorted.has(i.section_id),
      );
      const texts = [...new Set(untagged.map((i) => i.text))].slice(0, BATCH);
      if (texts.length === 0) return;

      const result = await this.call(texts);
      for (const item of untagged) {
        const category = result[item.text];
        // setCategory ignores the result if the text changed while waiting.
        if (isCategory(category)) this.note.getState().setCategory(item.id, category, item.text);
      }
    } catch {
      // Offline or the function failed. Items stay untagged; the next run retries.
    } finally {
      this.running = false;
    }
  }
}
