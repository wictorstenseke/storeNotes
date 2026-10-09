import type { Section } from './types';

// The store a list is sorted by on this device, or null for none. The choice is a device setting, so
// changing it never touches the list the others see. `sectionStores` holds '' for "chosen: none".
// Lists with no choice of their own yet follow the old synced "sort by store" flag and the store
// that was chosen back then.
export function sectionStoreId(
  section: Pick<Section, 'id' | 'store_sort'>,
  sectionStores: Record<string, string>,
  fallbackStoreId: string | null,
): string | null {
  if (section.id in sectionStores) return sectionStores[section.id] || null;
  return section.store_sort ? fallbackStoreId : null;
}
