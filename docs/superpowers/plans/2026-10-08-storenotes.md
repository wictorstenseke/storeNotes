# storeNotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, offline-capable checklist note for two people with instant editing, live sync, and per-store sorting of the grocery section.

**Architecture:** A React PWA renders from an in-memory Zustand store that mirrors an IndexedDB copy; every action updates memory first, then IndexedDB plus an outbox. A sync engine flushes the outbox to Supabase, merges Realtime changes and refetches on reconnect. Items are tagged with a category by a Supabase Edge Function that calls OpenRouter; sorting and learning are pure functions on the client.

**Tech Stack:** React, TypeScript, Vite, Tailwind, shadcn, Zustand, Dexie, fractional-indexing, dnd-kit, auto-animate, vite-plugin-pwa, Vitest, Testing Library, Supabase (Auth, Postgres, Realtime, Edge Functions), OpenRouter.

**Spec:** `docs/superpowers/specs/2026-10-08-storenotes-design.md`

## Global Constraints

- No action in the note awaits the network. Memory is updated synchronously; IndexedDB and the outbox follow.
- No spinners, skeletons or loading screens in the note.
- System font only (`-apple-system`), no web fonts.
- Item text is 16px. Section titles are 20px semibold. Secondary text (Done items, hints, offline indicator) is 13–14px. Nothing is larger than 20px.
- Item rows are 36px tall for one line of text; the whole row is tappable.
- No cards, boxes or shadows around sections.
- One accent colour (Apple Notes yellow); everything else is black, white and greys. Light and dark follow the phone's setting.
- Motion is 150–200ms and is off when Reduce Motion is on.
- All row ids are UUIDs generated on the client (`crypto.randomUUID()`).
- The category list is the fixed list of 24 in `supabase/functions/_shared/categories.ts`. Nothing else defines categories.
- The categorise function accepts at most 50 texts per request.
- OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`. Secrets: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ALLOWED_EMAILS`. None reach the client.
- Positions are `fractional-indexing` strings compared with plain `<` / `>`, never `localeCompare`.

## Deviations from the spec

These were chosen while planning. Each keeps the spec's behaviour and simplifies the build.

- Device settings (selected store, quick-add section, cached list id) live in `localStorage`, not Dexie, so they can be read synchronously at start-up.
- A line is held at its index in the list while focused, which is how "an item never changes position while it is focused" is implemented.
- Lines with empty text are hidden unless they are the line being edited on this device, so the other person never sees a half-created line.
- The categoriser tags every untagged item in sections with store sort on, not only items created on this device. Items in other sections are never sent to the model.
- A `bootstrap()` database function wraps `accept_invites()` and first-list creation in one call.

## Review Focus

- Multi-line text pasted into an item line: it becomes one line with spaces, never a line containing line breaks. (Task 7)
- The other person's change arrives for the line being typed in: the typed text is not replaced. (Task 7)
- The model returns something malformed (wrong length, not JSON, wrapped in a code fence): affected items become `other`, nothing is cached, nothing throws. (Task 14)
- An item is edited while its insert is still being sent: the edit still reaches the server. (Task 12)
- `Clear done` with Done items that have no category, or were checked in a store that no longer exists in code: no crash, no learning from them, items are still cleared. (Tasks 4 and 6)

## File Structure

```
index.html
vite.config.ts
vitest.db.config.ts
tsconfig.json
package.json
.env.example
public/icon.svg
src/
  main.tsx                    entry; mounts App, follows system theme
  App.tsx                     session gate; starts runtime; provides store
  index.css                   Tailwind, shadcn tokens, app tokens
  theme.ts                    toggles .dark from the system setting
  domain/
    categories.ts             re-export of the shared category list
    types.ts                  Section, Item, StoreOrder
    stores.ts                 the two stores and baseline orders
    position.ts               positionBetween
    parseQuickAdd.ts          split quick-add text
    sort.ts                   byManual, sortOpen, sortDone, Hold
    learning.ts               scores, trip ranks, effective order
    email.ts                  normalizeEmail
  sync/
    localDb.ts                Dexie schema, Mutation type
    outbox.ts                 Outbox class
    syncEngine.ts             SyncEngine, Remote interface
    supabaseRemote.ts         Remote backed by supabase-js
    supabaseClient.ts         the supabase-js client
    categorizer.ts            Categorizer class
    runtime.ts                wires db, outbox, store, engine, categoriser
  state/
    noteStore.ts              Zustand store and all note actions
    context.tsx               provider and hooks for the note store
    uiStore.ts                focus request, hold, selected store
    deviceSettings.ts         localStorage read/write
    syncStatus.ts             pending count, online flag, notice
  ui/
    NoteView.tsx  SectionView.tsx  SectionMenu.tsx  ItemLine.tsx
    DoneGroup.tsx  StorePicker.tsx  QuickAddBar.tsx  useKeyboardInset.ts
    SignIn.tsx  SettingsSheet.tsx  SyncIndicator.tsx
  components/ui/              shadcn output (sheet, dropdown-menu, alert-dialog)
  test/
    setup.ts  factories.ts  helpers.ts  fakeRemote.ts
supabase/
  config.toml
  migrations/20261008000000_init.sql
  functions/_shared/categories.ts
  functions/categorize/core.ts  core.test.ts  index.ts
  tests/access.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/theme.ts`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`. Path alias `@/` → `src/`. CSS colour classes `bg-page`, `text-ink`, `text-ink-2`, `border-line`, `bg-notes`, `text-notes-ink`. shadcn components at `@/components/ui/sheet`, `@/components/ui/dropdown-menu`, `@/components/ui/alert-dialog`.

- [ ] **Step 1: Write `package.json` and `.gitignore`**

`package.json`:

```json
{
  "name": "storenotes",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc"
  }
}
```

`.gitignore`:

```
node_modules
dist
dev-dist
.env
.env.*
!.env.example
supabase/.temp
supabase/.branches
.vercel
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom zustand dexie fractional-indexing @supabase/supabase-js @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @formkit/auto-animate
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb vite-plugin-pwa
```

Expected: both finish without errors. Peer-dependency warnings are fine.

- [ ] **Step 3: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "src",
    "vite.config.ts",
    "vitest.db.config.ts",
    "supabase/functions/_shared",
    "supabase/functions/categorize/core.ts",
    "supabase/functions/categorize/core.test.ts",
    "supabase/tests"
  ]
}
```

`vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    css: false,
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
    <title>storeNotes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css` (shadcn will rewrite this in Step 5; start with one line):

```css
@import "tailwindcss";
```

- [ ] **Step 4: Write the failing smoke test and test setup**

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the app shell', () => {
  render(<App />);
  expect(screen.getByText('storeNotes')).toBeInTheDocument();
});
```

Run: `npm test`
Expected: FAIL, cannot resolve `./App`.

- [ ] **Step 5: Add shadcn, then the app tokens**

```bash
npx shadcn@latest init -d
npx shadcn@latest add sheet dropdown-menu alert-dialog -y
```

Expected: `components.json`, `src/lib/utils.ts` and three files under `src/components/ui/` exist, and `src/index.css` now holds shadcn's tokens. If the CLI asks questions instead of using defaults, load the `shadcn` skill for the current flags; choose the neutral base colour and CSS variables.

Append to the end of `src/index.css`:

```css
:root {
  --page: #ffffff;
  --ink: #1c1c1e;
  --ink-2: #8e8e93;
  --line: #c7c7cc;
  --notes: #ffcc00;
  --notes-ink: #b58900;
}

.dark {
  --page: #000000;
  --ink: #f2f2f7;
  --ink-2: #98989f;
  --line: #48484a;
  --notes: #ffd60a;
  --notes-ink: #ffd60a;
}

@theme inline {
  --color-page: var(--page);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-line: var(--line);
  --color-notes: var(--notes);
  --color-notes-ink: var(--notes-ink);
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 16px;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}

textarea,
input,
button {
  font: inherit;
  color: inherit;
}
```

- [ ] **Step 6: Write the app shell**

`src/theme.ts`:

```ts
export function followSystemTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', query.matches);
  apply();
  query.addEventListener('change', apply);
}
```

`src/App.tsx`:

```tsx
export function App() {
  return <p className="p-4 text-[14px] text-ink-2">storeNotes</p>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { followSystemTheme } from './theme';
import './index.css';

followSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: 1 test passes, no type errors, build writes `dist/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Vite React app with Tailwind, shadcn and Vitest"
```

---

### Task 2: Domain basics — categories, types, stores, positions, quick-add parsing

**Files:**
- Create: `supabase/functions/_shared/categories.ts`, `src/domain/categories.ts`, `src/domain/types.ts`, `src/domain/stores.ts`, `src/domain/position.ts`, `src/domain/parseQuickAdd.ts`, `src/test/factories.ts`
- Test: `src/domain/stores.test.ts`, `src/domain/position.test.ts`, `src/domain/parseQuickAdd.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CATEGORIES: readonly string[]` (24 entries), `type Category`, `isCategory(v: unknown): v is Category`
  - `type Section`, `type Item`, `type StoreOrder` (fields below)
  - `type StoreDef = { id: string; name: string; baseline: Category[] }`, `STORES: StoreDef[]`, `getStore(id: string | null): StoreDef | undefined`
  - `positionBetween(before: string | null, after: string | null): string`
  - `parseQuickAdd(text: string): string[]`
  - Test factories `makeItem(p: Partial<Item> & { id: string }): Item`, `makeSection(p: Partial<Section> & { id: string }): Section`

- [ ] **Step 1: Write the failing tests**

`src/domain/stores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CATEGORIES, isCategory } from './categories';
import { STORES, getStore } from './stores';

describe('categories', () => {
  it('has 24 unique categories', () => {
    expect(CATEGORIES).toHaveLength(24);
    expect(new Set(CATEGORIES).size).toBe(24);
  });

  it('recognises only listed categories', () => {
    expect(isCategory('dairy')).toBe(true);
    expect(isCategory('Dairy')).toBe(false);
    expect(isCategory(3)).toBe(false);
  });
});

describe('stores', () => {
  it('defines two stores with unique ids', () => {
    expect(STORES).toHaveLength(2);
    expect(new Set(STORES.map((s) => s.id)).size).toBe(2);
  });

  it('lists every category exactly once in each baseline', () => {
    for (const store of STORES) {
      expect([...store.baseline].sort()).toEqual([...CATEGORIES].sort());
    }
  });

  it('finds a store by id', () => {
    expect(getStore(STORES[0].id)).toBe(STORES[0]);
    expect(getStore('nope')).toBeUndefined();
    expect(getStore(null)).toBeUndefined();
  });
});
```

`src/domain/position.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { positionBetween } from './position';

describe('positionBetween', () => {
  it('gives the first key when there are no neighbours', () => {
    expect(positionBetween(null, null)).toBe('a0');
  });

  it('gives a key after the last item', () => {
    expect(positionBetween('a0', null) > 'a0').toBe(true);
  });

  it('gives a key between two neighbours', () => {
    const key = positionBetween('a0', 'a1');
    expect(key > 'a0' && key < 'a1').toBe(true);
  });

  it('gives a usable key when both neighbours have the same position', () => {
    const key = positionBetween('a0', 'a0');
    expect(key > 'a0' && key < 'a1').toBe(true);
    expect(positionBetween(key, null) > key).toBe(true);
    const inner = positionBetween('a0', key);
    expect(inner > 'a0' && inner < key).toBe(true);
  });
});
```

`src/domain/parseQuickAdd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './parseQuickAdd';

describe('parseQuickAdd', () => {
  it('returns one item for plain text', () => {
    expect(parseQuickAdd('Milk')).toEqual(['Milk']);
  });

  it('splits on commas and line breaks and trims', () => {
    expect(parseQuickAdd('Milk, eggs\n  Bread \r\nCoffee')).toEqual(['Milk', 'eggs', 'Bread', 'Coffee']);
  });

  it('ignores empty parts', () => {
    expect(parseQuickAdd('Milk,, ,\n\nEggs,')).toEqual(['Milk', 'Eggs']);
  });

  it('returns nothing for whitespace only', () => {
    expect(parseQuickAdd('   \n ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementation**

`supabase/functions/_shared/categories.ts`:

```ts
export const CATEGORIES = [
  'produce',
  'bakery',
  'dairy',
  'cheese',
  'eggs',
  'meat',
  'fish',
  'deli',
  'frozen',
  'pantry',
  'pasta_rice',
  'canned',
  'baking',
  'spices_sauces',
  'breakfast',
  'snacks',
  'candy',
  'beverages',
  'coffee_tea',
  'household',
  'personal_care',
  'baby',
  'pet',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
```

`src/domain/categories.ts`:

```ts
export * from '../../supabase/functions/_shared/categories.ts';
```

`src/domain/types.ts`:

```ts
import type { Category } from './categories';

export type Section = {
  id: string;
  list_id: string;
  title: string;
  position: string;
  store_sort: boolean;
  updated_at: string;
  deleted_at: string | null;
};

export type Item = {
  id: string;
  list_id: string;
  section_id: string;
  text: string;
  position: string;
  checked: boolean;
  checked_at: string | null;
  checked_store: string | null;
  category: Category | null;
  updated_at: string;
  deleted_at: string | null;
};

export type StoreOrder = {
  list_id: string;
  store_id: string;
  scores: Record<string, number>;
  updated_at: string;
};
```

`src/domain/stores.ts`:

```ts
import type { Category } from './categories';

export type StoreDef = { id: string; name: string; baseline: Category[] };

// Example layouts. Task 15 replaces these with the two real stores.
export const STORES: StoreDef[] = [
  {
    id: 'store-a',
    name: 'Store A',
    baseline: [
      'produce', 'bakery', 'deli', 'cheese', 'meat', 'fish', 'dairy', 'eggs',
      'frozen', 'pantry', 'pasta_rice', 'canned', 'baking', 'spices_sauces',
      'breakfast', 'coffee_tea', 'beverages', 'snacks', 'household',
      'personal_care', 'baby', 'pet', 'candy', 'other',
    ],
  },
  {
    id: 'store-b',
    name: 'Store B',
    baseline: [
      'bakery', 'produce', 'dairy', 'eggs', 'cheese', 'deli', 'meat', 'fish',
      'pantry', 'pasta_rice', 'canned', 'spices_sauces', 'baking', 'breakfast',
      'coffee_tea', 'snacks', 'beverages', 'frozen', 'personal_care', 'baby',
      'household', 'pet', 'candy', 'other',
    ],
  },
];

export function getStore(id: string | null): StoreDef | undefined {
  return STORES.find((store) => store.id === id);
}
```

`src/domain/position.ts`:

```ts
import { generateKeyBetween } from 'fractional-indexing';

// Two devices can create the same position offline. When both neighbours share
// a position there is no key between them, so return one just after both.
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) return `${before}V`;
  return generateKeyBetween(before, after);
}
```

`src/domain/parseQuickAdd.ts`:

```ts
export function parseQuickAdd(text: string): string[] {
  return text
    .split(/[,\n\r]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}
```

`src/test/factories.ts`:

```ts
import type { Item, Section } from '../domain/types';

export function makeItem(p: Partial<Item> & { id: string }): Item {
  return {
    list_id: 'list-1',
    section_id: 'sec-1',
    text: p.id,
    position: 'a0',
    checked: false,
    checked_at: null,
    checked_store: null,
    category: null,
    updated_at: '2026-10-08T10:00:00.000Z',
    deleted_at: null,
    ...p,
  };
}

export function makeSection(p: Partial<Section> & { id: string }): Section {
  return {
    list_id: 'list-1',
    title: p.id,
    position: 'a0',
    store_sort: false,
    updated_at: '2026-10-08T10:00:00.000Z',
    deleted_at: null,
    ...p,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add categories, types, stores, positions and quick-add parsing"
```

---

### Task 3: Sorting

**Files:**
- Create: `src/domain/sort.ts`
- Test: `src/domain/sort.test.ts`

**Interfaces:**
- Consumes: `Item`, `Category`, `makeItem`.
- Produces:
  - `type Hold = { id: string; index: number }` — the line being edited and the index it must stay at.
  - `byManual<T extends { position: string; id: string }>(a: T, b: T): number`
  - `sortOpen(items: Item[], order: Category[] | null, hold?: Hold | null): Item[]` — unchecked, not deleted, empty-text lines hidden unless held. `order` null means manual order.
  - `sortDone(items: Item[]): Item[]` — checked, not deleted, most recently checked first.

- [ ] **Step 1: Write the failing tests**

`src/domain/sort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Category } from './categories';
import { sortDone, sortOpen } from './sort';
import { makeItem } from '../test/factories';

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const ORDER: Category[] = ['produce', 'dairy', 'frozen'];

describe('sortOpen, manual order', () => {
  it('orders by position', () => {
    const items = [
      makeItem({ id: 'c', position: 'a2' }),
      makeItem({ id: 'a', position: 'a0' }),
      makeItem({ id: 'b', position: 'a1' }),
    ];
    expect(ids(sortOpen(items, null))).toEqual(['a', 'b', 'c']);
  });

  it('orders items with the same position by id', () => {
    const items = [makeItem({ id: 'z', position: 'a0' }), makeItem({ id: 'm', position: 'a0' })];
    expect(ids(sortOpen(items, null))).toEqual(['m', 'z']);
  });

  it('leaves out checked and deleted items', () => {
    const items = [
      makeItem({ id: 'a' }),
      makeItem({ id: 'b', checked: true, checked_at: '2026-10-08T10:00:00.000Z' }),
      makeItem({ id: 'c', deleted_at: '2026-10-08T10:00:00.000Z' }),
    ];
    expect(ids(sortOpen(items, null))).toEqual(['a']);
  });

  it('hides empty lines unless they are held', () => {
    const items = [makeItem({ id: 'a', position: 'a0' }), makeItem({ id: 'b', position: 'a1', text: '' })];
    expect(ids(sortOpen(items, null))).toEqual(['a']);
    expect(ids(sortOpen(items, null, { id: 'b', index: 1 }))).toEqual(['a', 'b']);
  });
});

describe('sortOpen, store order', () => {
  it('puts untagged first, then category rank, then position', () => {
    const items = [
      makeItem({ id: 'ice', position: 'a0', category: 'frozen' }),
      makeItem({ id: 'milk', position: 'a1', category: 'dairy' }),
      makeItem({ id: 'new', position: 'a2', category: null }),
      makeItem({ id: 'apple', position: 'a3', category: 'produce' }),
      makeItem({ id: 'yoghurt', position: 'a4', category: 'dairy' }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['new', 'apple', 'milk', 'yoghurt', 'ice']);
  });

  it('puts categories missing from the order last', () => {
    const items = [
      makeItem({ id: 'soap', position: 'a0', category: 'household' }),
      makeItem({ id: 'ice', position: 'a1', category: 'frozen' }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['ice', 'soap']);
  });

  it('keeps the held item at its index even when sorting would move it', () => {
    const items = [
      makeItem({ id: 'apple', position: 'a0', category: 'produce' }),
      makeItem({ id: 'milk', position: 'a1', category: 'dairy' }),
      makeItem({ id: 'typing', position: 'a2', category: null }),
    ];
    expect(ids(sortOpen(items, ORDER))).toEqual(['typing', 'apple', 'milk']);
    expect(ids(sortOpen(items, ORDER, { id: 'typing', index: 2 }))).toEqual(['apple', 'milk', 'typing']);
  });

  it('clamps a held index that is past the end', () => {
    const items = [makeItem({ id: 'a', position: 'a0' }), makeItem({ id: 'b', position: 'a1' })];
    expect(ids(sortOpen(items, null, { id: 'a', index: 9 }))).toEqual(['b', 'a']);
  });

  it('ignores a hold for an item that is not in the list', () => {
    const items = [makeItem({ id: 'a' })];
    expect(ids(sortOpen(items, null, { id: 'gone', index: 0 }))).toEqual(['a']);
  });
});

describe('sortDone', () => {
  it('returns checked items, most recently checked first', () => {
    const items = [
      makeItem({ id: 'open' }),
      makeItem({ id: 'first', checked: true, checked_at: '2026-10-08T10:00:01.000Z' }),
      makeItem({ id: 'last', checked: true, checked_at: '2026-10-08T10:00:03.000Z' }),
      makeItem({ id: 'gone', checked: true, checked_at: '2026-10-08T10:00:04.000Z', deleted_at: 'x' }),
    ];
    expect(ids(sortDone(items))).toEqual(['last', 'first']);
  });

  it('compares timestamps written in different formats', () => {
    const items = [
      makeItem({ id: 'client', checked: true, checked_at: '2026-10-08T10:00:02.000Z' }),
      makeItem({ id: 'server', checked: true, checked_at: '2026-10-08T10:00:05+00:00' }),
    ];
    expect(ids(sortDone(items))).toEqual(['server', 'client']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/sort.test.ts`
Expected: FAIL, cannot resolve `./sort`.

- [ ] **Step 3: Write the implementation**

`src/domain/sort.ts`:

```ts
import type { Category } from './categories';
import type { Item } from './types';

export type Hold = { id: string; index: number };

export function byManual<T extends { position: string; id: string }>(a: T, b: T): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortOpen(items: Item[], order: Category[] | null, hold: Hold | null = null): Item[] {
  const open = items.filter(
    (i) => !i.checked && !i.deleted_at && (i.text !== '' || i.id === hold?.id),
  );

  let sorted: Item[];
  if (!order) {
    sorted = [...open].sort(byManual);
  } else {
    const rank = (i: Item): number => {
      if (i.category === null) return -1;
      const at = order.indexOf(i.category);
      return at === -1 ? order.length : at;
    };
    sorted = [...open].sort((a, b) => rank(a) - rank(b) || byManual(a, b));
  }

  if (!hold) return sorted;
  const held = sorted.find((i) => i.id === hold.id);
  if (!held) return sorted;
  const rest = sorted.filter((i) => i.id !== hold.id);
  const at = Math.max(0, Math.min(hold.index, rest.length));
  return [...rest.slice(0, at), held, ...rest.slice(at)];
}

export function sortDone(items: Item[]): Item[] {
  const time = (i: Item) => (i.checked_at ? Date.parse(i.checked_at) : 0);
  return items
    .filter((i) => i.checked && !i.deleted_at)
    .sort((a, b) => time(b) - time(a) || (a.id < b.id ? -1 : 1));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/sort.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add manual and store-order sorting"
```

---

### Task 4: Learning store order from check-offs

**Files:**
- Create: `src/domain/learning.ts`
- Test: `src/domain/learning.test.ts`

**Interfaces:**
- Consumes: `Item`, `Category`, `StoreDef`, `makeItem`.
- Produces:
  - `type Scores = Record<string, number>`
  - `baselineScores(baseline: Category[]): Scores` — position scaled to 0–1.
  - `tripRanks(done: Item[]): Scores | null` — mean check-off index per category scaled to 0–1; `null` when fewer than three distinct categories.
  - `applyTrip(scores: Scores, ranks: Scores): Scores` — `0.7 × old + 0.3 × rank`.
  - `effectiveOrder(baseline: Category[], scores?: Scores | null): Category[]`
  - `learnFromDone(done: Item[], stores: StoreDef[], current: Record<string, Scores | undefined>): Record<string, Scores>` — new scores per store id, only for stores that had a usable trip.

- [ ] **Step 1: Write the failing tests**

`src/domain/learning.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Category } from './categories';
import { applyTrip, baselineScores, effectiveOrder, learnFromDone, tripRanks } from './learning';
import type { StoreDef } from './stores';
import { makeItem } from '../test/factories';

const BASE: Category[] = ['produce', 'dairy', 'frozen', 'candy', 'other'];
const STORE: StoreDef = { id: 's1', name: 'S1', baseline: BASE };
const OTHER_STORE: StoreDef = { id: 's2', name: 'S2', baseline: BASE };

const at = (second: number) => `2026-10-08T10:00:${String(second).padStart(2, '0')}.000Z`;
const done = (id: string, category: Category | null, second: number, store: string | null = 's1') =>
  makeItem({ id, category, checked: true, checked_at: at(second), checked_store: store });

describe('baselineScores', () => {
  it('scales position to 0–1', () => {
    expect(baselineScores(BASE)).toEqual({ produce: 0, dairy: 0.25, frozen: 0.5, candy: 0.75, other: 1 });
  });
});

describe('tripRanks', () => {
  it('gives the mean check-off index per category, scaled to 0–1', () => {
    const ranks = tripRanks([
      done('ice', 'frozen', 4),
      done('apple', 'produce', 1),
      done('milk', 'dairy', 3),
      done('pear', 'produce', 2),
    ]);
    expect(ranks).not.toBeNull();
    expect(ranks!.produce).toBeCloseTo(1 / 6);
    expect(ranks!.dairy).toBeCloseTo(2 / 3);
    expect(ranks!.frozen).toBeCloseTo(1);
  });

  it('returns null with fewer than three distinct categories', () => {
    expect(tripRanks([done('a', 'produce', 1), done('b', 'produce', 2), done('c', 'dairy', 3)])).toBeNull();
  });

  it('ignores items with no category', () => {
    expect(
      tripRanks([done('a', 'produce', 1), done('b', 'dairy', 2), done('c', null, 3), done('d', null, 4)]),
    ).toBeNull();
  });
});

describe('applyTrip', () => {
  it('moves each score 30% toward the trip rank and leaves others alone', () => {
    const next = applyTrip({ produce: 0, dairy: 0.5, frozen: 1 }, { produce: 1, dairy: 0.5 });
    expect(next.produce).toBeCloseTo(0.3);
    expect(next.dairy).toBeCloseTo(0.5);
    expect(next.frozen).toBe(1);
  });
});

describe('effectiveOrder', () => {
  it('is the baseline when there are no scores', () => {
    expect(effectiveOrder(BASE)).toEqual(BASE);
    expect(effectiveOrder(BASE, null)).toEqual(BASE);
  });

  it('sorts by score and fills missing scores from the baseline', () => {
    expect(effectiveOrder(BASE, { produce: 0.6 })).toEqual(['dairy', 'frozen', 'produce', 'candy', 'other']);
  });

  it('breaks ties by baseline order', () => {
    expect(effectiveOrder(BASE, { frozen: 0.25 })).toEqual(['produce', 'dairy', 'frozen', 'candy', 'other']);
  });
});

describe('learnFromDone', () => {
  it('returns new scores for a store with a usable trip', () => {
    const learned = learnFromDone(
      [done('ice', 'frozen', 1), done('milk', 'dairy', 2), done('apple', 'produce', 3)],
      [STORE],
      {},
    );
    expect(Object.keys(learned)).toEqual(['s1']);
    expect(learned.s1.frozen).toBeCloseTo(0.7 * 0.5 + 0.3 * 0);
    expect(learned.s1.produce).toBeCloseTo(0.7 * 0 + 0.3 * 1);
    expect(learned.s1.candy).toBe(0.75);
  });

  it('starts from the current scores when there are some', () => {
    const learned = learnFromDone(
      [done('ice', 'frozen', 1), done('milk', 'dairy', 2), done('apple', 'produce', 3)],
      [STORE],
      { s1: { produce: 1 } },
    );
    expect(learned.s1.produce).toBeCloseTo(1);
  });

  it('handles each store separately', () => {
    const learned = learnFromDone(
      [
        done('a', 'frozen', 1, 's1'), done('b', 'dairy', 2, 's1'), done('c', 'produce', 3, 's1'),
        done('d', 'produce', 4, 's2'), done('e', 'dairy', 5, 's2'),
      ],
      [STORE, OTHER_STORE],
      {},
    );
    expect(Object.keys(learned)).toEqual(['s1']);
  });

  it('learns nothing from items with no store, an unknown store, or no category', () => {
    const learned = learnFromDone(
      [
        done('a', 'frozen', 1, null), done('b', 'dairy', 2, null), done('c', 'produce', 3, null),
        done('d', 'frozen', 4, 'closed'), done('e', 'dairy', 5, 'closed'), done('f', 'produce', 6, 'closed'),
        done('g', null, 7, 's1'), done('h', null, 8, 's1'), done('i', null, 9, 's1'),
      ],
      [STORE],
      {},
    );
    expect(learned).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/learning.test.ts`
Expected: FAIL, cannot resolve `./learning`.

- [ ] **Step 3: Write the implementation**

`src/domain/learning.ts`:

```ts
import type { Category } from './categories';
import type { StoreDef } from './stores';
import type { Item } from './types';

export type Scores = Record<string, number>;

const MIN_TRIP_CATEGORIES = 3;
const KEEP = 0.7;

export function baselineScores(baseline: Category[]): Scores {
  const last = baseline.length - 1;
  return Object.fromEntries(baseline.map((c, i) => [c, last > 0 ? i / last : 0]));
}

export function tripRanks(done: Item[]): Scores | null {
  const trip = done
    .filter((i) => i.category !== null && i.checked_at !== null)
    .sort(
      (a, b) =>
        Date.parse(a.checked_at!) - Date.parse(b.checked_at!) || (a.id < b.id ? -1 : 1),
    );

  const totals = new Map<string, { sum: number; count: number }>();
  const last = trip.length - 1;
  trip.forEach((item, index) => {
    const total = totals.get(item.category!) ?? { sum: 0, count: 0 };
    total.sum += last > 0 ? index / last : 0;
    total.count += 1;
    totals.set(item.category!, total);
  });

  if (totals.size < MIN_TRIP_CATEGORIES) return null;
  return Object.fromEntries([...totals].map(([c, t]) => [c, t.sum / t.count]));
}

export function applyTrip(scores: Scores, ranks: Scores): Scores {
  const next = { ...scores };
  for (const [category, rank] of Object.entries(ranks)) {
    next[category] = KEEP * (scores[category] ?? rank) + (1 - KEEP) * rank;
  }
  return next;
}

export function effectiveOrder(baseline: Category[], scores?: Scores | null): Category[] {
  const all = { ...baselineScores(baseline), ...(scores ?? {}) };
  return [...baseline].sort(
    (a, b) => all[a] - all[b] || baseline.indexOf(a) - baseline.indexOf(b),
  );
}

export function learnFromDone(
  done: Item[],
  stores: StoreDef[],
  current: Record<string, Scores | undefined>,
): Record<string, Scores> {
  const learned: Record<string, Scores> = {};
  for (const store of stores) {
    const ranks = tripRanks(done.filter((i) => i.checked_store === store.id));
    if (!ranks) continue;
    learned[store.id] = applyTrip(
      { ...baselineScores(store.baseline), ...(current[store.id] ?? {}) },
      ranks,
    );
  }
  return learned;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/learning.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add store-order learning from check-off order"
```

---

### Task 5: Local database and outbox

**Files:**
- Create: `src/sync/localDb.ts`, `src/sync/outbox.ts`
- Test: `src/sync/outbox.test.ts`

**Interfaces:**
- Consumes: `Section`, `Item`, `StoreOrder`.
- Produces:
  - `type TableName = 'sections' | 'items' | 'store_orders'`
  - `type Mutation = { seq?: number; table: TableName; kind: 'insert' | 'patch' | 'upsert'; id: string; values: Record<string, unknown> }`. For `store_orders`, `id` is the `store_id` and `kind` is always `upsert`.
  - `class LocalDb extends Dexie` with tables `sections`, `items`, `store_orders`, `outbox`. Constructor takes an optional database name (default `'storenotes'`).
  - `class Outbox` with `enqueue(m: Omit<Mutation, 'seq'>): Promise<void>`, `next(): Promise<Mutation | undefined>` (marks it in flight), `done(seq: number): Promise<void>`, `release(): void`, `count(): Promise<number>`, `pendingFields(): Promise<Map<string, Set<string>>>` keyed by `` `${table}:${id}` ``.

Rules the outbox enforces:
- Order is preserved.
- A new patch is merged into the last queued mutation only when that one is a patch for the same row and is not in flight. Same for upserts.
- A patch is never merged into an insert, so a retried insert stays identical to the first attempt.

- [ ] **Step 1: Write the failing tests**

`src/sync/outbox.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';

let db: LocalDb;
let outbox: Outbox;

beforeEach(() => {
  db = new LocalDb(`outbox-${Math.random()}`);
  outbox = new Outbox(db);
});

const all = () => db.outbox.orderBy('seq').toArray();

describe('Outbox', () => {
  it('keeps mutations in the order they were queued', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a' } });
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'b', values: { id: 'b' } });
    expect((await all()).map((m) => m.id)).toEqual(['a', 'b']);
    expect((await outbox.next())?.id).toBe('a');
    expect(await outbox.count()).toBe(2);
  });

  it('merges a patch into the previous patch for the same row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Mil' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Milk', checked: true } });
    const queued = await all();
    expect(queued).toHaveLength(1);
    expect(queued[0].values).toEqual({ text: 'Milk', checked: true });
  });

  it('does not merge a patch into an insert', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a', text: '' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'Milk' } });
    const queued = await all();
    expect(queued.map((m) => m.kind)).toEqual(['insert', 'patch']);
    expect(queued[0].values).toEqual({ id: 'a', text: '' });
  });

  it('does not merge across a mutation for another row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'b', values: { text: 'B' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect((await all()).map((m) => m.id)).toEqual(['a', 'b', 'a']);
  });

  it('does not merge into the mutation that is in flight', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.next();
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect(await outbox.count()).toBe(2);
  });

  it('merges again after the in-flight mutation is released', async () => {
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A' } });
    await outbox.next();
    outbox.release();
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { text: 'A2' } });
    expect(await outbox.count()).toBe(1);
  });

  it('removes a mutation when it is done', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a' } });
    const first = await outbox.next();
    await outbox.done(first!.seq!);
    expect(await outbox.count()).toBe(0);
    expect(await outbox.next()).toBeUndefined();
  });

  it('replaces a queued upsert for the same store order', async () => {
    await outbox.enqueue({ table: 'store_orders', kind: 'upsert', id: 's1', values: { store_id: 's1', scores: { a: 1 } } });
    await outbox.enqueue({ table: 'store_orders', kind: 'upsert', id: 's1', values: { store_id: 's1', scores: { a: 2 } } });
    const queued = await all();
    expect(queued).toHaveLength(1);
    expect(queued[0].values).toEqual({ store_id: 's1', scores: { a: 2 } });
  });

  it('reports the pending fields per row', async () => {
    await outbox.enqueue({ table: 'items', kind: 'insert', id: 'a', values: { id: 'a', text: '' } });
    await outbox.enqueue({ table: 'items', kind: 'patch', id: 'a', values: { checked: true } });
    await outbox.enqueue({ table: 'sections', kind: 'patch', id: 's', values: { title: 'X' } });
    const pending = await outbox.pendingFields();
    expect([...pending.get('items:a')!].sort()).toEqual(['checked', 'id', 'text']);
    expect([...pending.get('sections:s')!]).toEqual(['title']);
    expect(pending.get('items:zzz')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/outbox.test.ts`
Expected: FAIL, cannot resolve `./localDb`.

- [ ] **Step 3: Write the implementation**

`src/sync/localDb.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { Item, Section, StoreOrder } from '../domain/types';

export type TableName = 'sections' | 'items' | 'store_orders';

export type Mutation = {
  seq?: number;
  table: TableName;
  kind: 'insert' | 'patch' | 'upsert';
  id: string;
  values: Record<string, unknown>;
};

export class LocalDb extends Dexie {
  sections!: Table<Section, string>;
  items!: Table<Item, string>;
  store_orders!: Table<StoreOrder, [string, string]>;
  outbox!: Table<Mutation, number>;

  constructor(name = 'storenotes') {
    super(name);
    this.version(1).stores({
      sections: 'id',
      items: 'id',
      store_orders: '[list_id+store_id]',
      outbox: '++seq',
    });
  }
}
```

`src/sync/outbox.ts`:

```ts
import type { LocalDb, Mutation } from './localDb';

export class Outbox {
  private inFlight: number | null = null;

  constructor(private db: LocalDb) {}

  async enqueue(m: Omit<Mutation, 'seq'>): Promise<void> {
    const last = await this.db.outbox.orderBy('seq').last();
    const mergeable =
      last !== undefined &&
      last.seq !== this.inFlight &&
      m.kind !== 'insert' &&
      last.kind === m.kind &&
      last.table === m.table &&
      last.id === m.id;
    if (mergeable) {
      await this.db.outbox.update(last.seq!, { values: { ...last.values, ...m.values } });
      return;
    }
    await this.db.outbox.add({ ...m });
  }

  async next(): Promise<Mutation | undefined> {
    const first = await this.db.outbox.orderBy('seq').first();
    this.inFlight = first?.seq ?? null;
    return first;
  }

  async done(seq: number): Promise<void> {
    await this.db.outbox.delete(seq);
    if (this.inFlight === seq) this.inFlight = null;
  }

  release(): void {
    this.inFlight = null;
  }

  count(): Promise<number> {
    return this.db.outbox.count();
  }

  async pendingFields(): Promise<Map<string, Set<string>>> {
    const pending = new Map<string, Set<string>>();
    for (const m of await this.db.outbox.toArray()) {
      const key = `${m.table}:${m.id}`;
      const fields = pending.get(key) ?? new Set<string>();
      for (const field of Object.keys(m.values)) fields.add(field);
      pending.set(key, fields);
    }
    return pending;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sync/outbox.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add local database and outbox"
```

---

### Task 6: Note store

**Files:**
- Create: `src/state/noteStore.ts`, `src/test/helpers.ts`
- Test: `src/state/noteStore.test.ts`

**Interfaces:**
- Consumes: `LocalDb`, `Outbox`, `Mutation`, `positionBetween`, `byManual`, `sortOpen`, `learnFromDone`, `STORES`, `StoreDef`, domain types.
- Produces:
  - `type NoteState = { listId: string | null; sections: Section[]; items: Item[]; storeOrders: StoreOrder[]; ready: boolean }`. `sections` and `items` never contain soft-deleted rows.
  - `type NoteActions`:
    - `load(listId: string): Promise<void>`
    - `reload(): Promise<void>` — re-read IndexedDB into memory after the sync engine wrote to it
    - `idle(): Promise<void>` — resolves when queued IndexedDB writes are done
    - `addItem(sectionId: string, text: string, afterId?: string | null): string` — returns the new id
    - `addItems(sectionId: string, texts: string[]): string[]`
    - `setItemText(id: string, text: string): void` — also sets `category` to null
    - `setCategory(id: string, category: Category, forText: string): void` — ignored unless the item's text still equals `forText`
    - `checkItem(id: string, storeId: string | null): void`
    - `uncheckItem(id: string): void`
    - `moveItem(id: string, toIndex: number): void` — `toIndex` is the item's final index in the section's manual open list
    - `deleteItem(id: string): void`
    - `clearDone(sectionId: string): void`
    - `addSection(title?: string): string`
    - `renameSection(id: string, title: string): void`
    - `setStoreSort(id: string, on: boolean): void`
    - `deleteSection(id: string): void`
  - `type NoteDeps = { db: LocalDb; outbox: Outbox; now?: () => string; newId?: () => string; onLocalWrite?: () => void; stores?: StoreDef[] }`
  - `type NoteStore = StoreApi<NoteState & NoteActions>`
  - `createNoteStore(deps: NoteDeps): NoteStore`
  - Test helper `makeStore(deps?: Partial<NoteDeps>): Promise<{ db: LocalDb; outbox: Outbox; store: NoteStore }>` — list id `'list-1'`, ids `id-001`, `id-002`, …, timestamps one second apart.

Every action with an unknown id is a silent no-op.

- [ ] **Step 1: Write the test helper**

`src/test/helpers.ts`:

```ts
import { createNoteStore, type NoteDeps, type NoteStore } from '../state/noteStore';
import { LocalDb } from '../sync/localDb';
import { Outbox } from '../sync/outbox';

export async function makeStore(
  deps: Partial<NoteDeps> = {},
): Promise<{ db: LocalDb; outbox: Outbox; store: NoteStore }> {
  const db = deps.db ?? new LocalDb(`note-${Math.random()}`);
  const outbox = deps.outbox ?? new Outbox(db);
  let ids = 0;
  let ticks = 0;
  const store = createNoteStore({
    newId: () => `id-${String(++ids).padStart(3, '0')}`,
    now: () => new Date(Date.UTC(2026, 9, 8, 10, 0, ticks++)).toISOString(),
    ...deps,
    db,
    outbox,
  });
  await store.getState().load('list-1');
  return { db, outbox, store };
}
```

- [ ] **Step 2: Write the failing tests**

`src/state/noteStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Category } from '../domain/categories';
import { sortOpen } from '../domain/sort';
import type { StoreDef } from '../domain/stores';
import { makeStore } from '../test/helpers';

const BASE: Category[] = ['produce', 'dairy', 'frozen', 'candy', 'other'];
const STORE: StoreDef = { id: 's1', name: 'S1', baseline: BASE };

async function withSection() {
  const ctx = await makeStore({ stores: [STORE] });
  const sectionId = ctx.store.getState().addSection('Grocery List');
  await ctx.store.getState().idle();
  return { ...ctx, sectionId, s: () => ctx.store.getState() };
}

const queued = async (ctx: Awaited<ReturnType<typeof withSection>>) =>
  (await ctx.db.outbox.orderBy('seq').toArray()).map((m) => `${m.table}:${m.kind}:${m.id}`);

describe('items', () => {
  it('adds an item at the end, in memory at once and then on disk', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    const b = ctx.s().addItem(ctx.sectionId, 'Eggs');
    expect(ctx.s().items.map((i) => i.text)).toEqual(['Milk', 'Eggs']);
    const [first, second] = ctx.s().items;
    expect(first.position < second.position).toBe(true);
    await ctx.s().idle();
    expect((await ctx.db.items.get(a))?.text).toBe('Milk');
    expect(await queued(ctx)).toEqual([
      `sections:insert:${ctx.sectionId}`,
      `items:insert:${a}`,
      `items:insert:${b}`,
    ]);
  });

  it('adds an item directly after another', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'A');
    ctx.s().addItem(ctx.sectionId, 'C');
    ctx.s().addItem(ctx.sectionId, 'B', a);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('adds several items in order', async () => {
    const ctx = await withSection();
    ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('clears the category when the text changes, and does nothing when it does not', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().setCategory(a, 'dairy', 'Milk');
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().setItemText(a, 'Milk');
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
    ctx.s().setItemText(a, 'Oat milk');
    expect(ctx.s().items[0]).toMatchObject({ text: 'Oat milk', category: null });
  });

  it('ignores a category that was computed for older text', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().setItemText(a, 'Soap');
    ctx.s().setCategory(a, 'dairy', 'Milk');
    expect(ctx.s().items[0].category).toBeNull();
  });

  it('checks and unchecks', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().checkItem(a, 's1');
    expect(ctx.s().items[0]).toMatchObject({ checked: true, checked_store: 's1' });
    expect(ctx.s().items[0].checked_at).not.toBeNull();
    ctx.s().uncheckItem(a);
    expect(ctx.s().items[0]).toMatchObject({ checked: false, checked_at: null, checked_store: null });
  });

  it('moves an item to a new index', async () => {
    const ctx = await withSection();
    const [a, , c] = ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    ctx.s().moveItem(c, 0);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['C', 'A', 'B']);
    ctx.s().moveItem(a, 2);
    expect(sortOpen(ctx.s().items, null).map((i) => i.text)).toEqual(['C', 'B', 'A']);
  });

  it('soft-deletes an item', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    ctx.s().deleteItem(a);
    expect(ctx.s().items).toEqual([]);
    await ctx.s().idle();
    expect((await ctx.db.items.get(a))?.deleted_at).not.toBeNull();
    expect((await queued(ctx)).at(-1)).toBe(`items:patch:${a}`);
  });

  it('ignores actions for unknown ids', async () => {
    const ctx = await withSection();
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().setItemText('nope', 'x');
    ctx.s().checkItem('nope', null);
    ctx.s().uncheckItem('nope');
    ctx.s().moveItem('nope', 0);
    ctx.s().deleteItem('nope');
    ctx.s().setCategory('nope', 'dairy', 'x');
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
  });
});

describe('clearDone', () => {
  it('learns the store order from the trip and deletes the Done items', async () => {
    const ctx = await withSection();
    const [ice, milk, apple, keep] = ctx.s().addItems(ctx.sectionId, ['Ice', 'Milk', 'Apple', 'Keep']);
    ctx.s().setCategory(ice, 'frozen', 'Ice');
    ctx.s().setCategory(milk, 'dairy', 'Milk');
    ctx.s().setCategory(apple, 'produce', 'Apple');
    ctx.s().checkItem(ice, 's1');
    ctx.s().checkItem(milk, 's1');
    ctx.s().checkItem(apple, 's1');
    ctx.s().clearDone(ctx.sectionId);

    expect(ctx.s().items.map((i) => i.id)).toEqual([keep]);
    expect(ctx.s().storeOrders).toHaveLength(1);
    expect(ctx.s().storeOrders[0].store_id).toBe('s1');
    expect(ctx.s().storeOrders[0].scores.produce).toBeCloseTo(0.3);

    await ctx.s().idle();
    expect(await ctx.db.store_orders.get(['list-1', 's1'])).toBeDefined();
    expect(await queued(ctx)).toContain('store_orders:upsert:s1');
  });

  it('clears Done items it cannot learn from without touching store orders', async () => {
    const ctx = await withSection();
    const [a, b, c] = ctx.s().addItems(ctx.sectionId, ['A', 'B', 'C']);
    ctx.s().setCategory(b, 'dairy', 'B');
    ctx.s().checkItem(a, 's1');
    ctx.s().checkItem(b, 'closed-store');
    ctx.s().checkItem(c, null);
    ctx.s().clearDone(ctx.sectionId);
    expect(ctx.s().items).toEqual([]);
    expect(ctx.s().storeOrders).toEqual([]);
    await ctx.s().idle();
    expect(await ctx.db.store_orders.count()).toBe(0);
  });

  it('does nothing when there are no Done items', async () => {
    const ctx = await withSection();
    ctx.s().addItem(ctx.sectionId, 'A');
    await ctx.s().idle();
    const before = await ctx.outbox.count();
    ctx.s().clearDone(ctx.sectionId);
    await ctx.s().idle();
    expect(await ctx.outbox.count()).toBe(before);
  });
});

describe('sections', () => {
  it('adds sections in order with store sort off', async () => {
    const ctx = await withSection();
    const second = ctx.s().addSection('Gifts');
    const [a, b] = ctx.s().sections;
    expect(a.position < b.position).toBe(true);
    expect(b).toMatchObject({ id: second, title: 'Gifts', store_sort: false });
  });

  it('renames and toggles store sort', async () => {
    const ctx = await withSection();
    ctx.s().renameSection(ctx.sectionId, 'Food');
    ctx.s().setStoreSort(ctx.sectionId, true);
    expect(ctx.s().sections[0]).toMatchObject({ title: 'Food', store_sort: true });
  });

  it('deletes a section and its items', async () => {
    const ctx = await withSection();
    const other = ctx.s().addSection('Gifts');
    ctx.s().addItem(ctx.sectionId, 'Milk');
    const lego = ctx.s().addItem(other, 'Lego');
    ctx.s().deleteSection(ctx.sectionId);
    expect(ctx.s().sections.map((x) => x.id)).toEqual([other]);
    expect(ctx.s().items.map((x) => x.id)).toEqual([lego]);
  });
});

describe('loading', () => {
  it('reads the list back from disk without soft-deleted rows', async () => {
    const ctx = await withSection();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    const b = ctx.s().addItem(ctx.sectionId, 'Eggs');
    ctx.s().deleteItem(b);
    await ctx.s().idle();

    const again = await makeStore({ db: ctx.db, outbox: ctx.outbox });
    expect(again.store.getState().ready).toBe(true);
    expect(again.store.getState().items.map((i) => i.id)).toEqual([a]);
    expect(again.store.getState().sections).toHaveLength(1);
  });

  it('does not lose a change made while a reload is reading', async () => {
    const ctx = await withSection();
    const reloading = ctx.s().reload();
    const a = ctx.s().addItem(ctx.sectionId, 'Milk');
    await reloading;
    await ctx.s().idle();
    expect(ctx.s().items.map((i) => i.id)).toEqual([a]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/state/noteStore.test.ts`
Expected: FAIL, cannot resolve `../state/noteStore`.

- [ ] **Step 4: Write the implementation**

`src/state/noteStore.ts`:

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Category } from '../domain/categories';
import { learnFromDone } from '../domain/learning';
import { positionBetween } from '../domain/position';
import { byManual, sortOpen } from '../domain/sort';
import { STORES, type StoreDef } from '../domain/stores';
import type { Item, Section, StoreOrder } from '../domain/types';
import type { LocalDb, Mutation } from '../sync/localDb';
import type { Outbox } from '../sync/outbox';

export type NoteState = {
  listId: string | null;
  sections: Section[];
  items: Item[];
  storeOrders: StoreOrder[];
  ready: boolean;
};

export type NoteActions = {
  load(listId: string): Promise<void>;
  reload(): Promise<void>;
  idle(): Promise<void>;
  addItem(sectionId: string, text: string, afterId?: string | null): string;
  addItems(sectionId: string, texts: string[]): string[];
  setItemText(id: string, text: string): void;
  setCategory(id: string, category: Category, forText: string): void;
  checkItem(id: string, storeId: string | null): void;
  uncheckItem(id: string): void;
  moveItem(id: string, toIndex: number): void;
  deleteItem(id: string): void;
  clearDone(sectionId: string): void;
  addSection(title?: string): string;
  renameSection(id: string, title: string): void;
  setStoreSort(id: string, on: boolean): void;
  deleteSection(id: string): void;
};

export type NoteDeps = {
  db: LocalDb;
  outbox: Outbox;
  now?: () => string;
  newId?: () => string;
  onLocalWrite?: () => void;
  stores?: StoreDef[];
};

export type NoteStore = StoreApi<NoteState & NoteActions>;

type Op = Omit<Mutation, 'seq'>;

export function createNoteStore(deps: NoteDeps): NoteStore {
  const { db, outbox } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const stores = deps.stores ?? STORES;

  // All IndexedDB work runs through one queue so reads never overtake writes.
  let queue: Promise<void> = Promise.resolve();
  let writes = 0;

  const run = (fn: () => Promise<void>): Promise<void> => {
    queue = queue.then(fn).catch((error) => console.error(error));
    return queue;
  };

  const persist = (ops: Op[]): void => {
    if (ops.length === 0) return;
    writes += 1;
    void run(async () => {
      try {
        await db.transaction('rw', [db.sections, db.items, db.store_orders, db.outbox], async () => {
          for (const op of ops) {
            if (op.table === 'store_orders') {
              await db.store_orders.put(op.values as StoreOrder);
            } else if (op.kind === 'insert') {
              await db.table(op.table).put(op.values);
            } else {
              await db.table(op.table).update(op.id, op.values);
            }
            await outbox.enqueue(op);
          }
        });
      } finally {
        writes -= 1;
      }
      deps.onLocalWrite?.();
    });
  };

  return createStore<NoteState & NoteActions>()((set, get) => {
    const listId = (): string => {
      const id = get().listId;
      if (!id) throw new Error('No list loaded');
      return id;
    };

    const findItem = (id: string) => get().items.find((i) => i.id === id);
    const findSection = (id: string) => get().sections.find((s) => s.id === id);

    const patchItem = (id: string, values: Partial<Item>): void => {
      set({ items: get().items.map((i) => (i.id === id ? { ...i, ...values } : i)) });
      persist([{ table: 'items', kind: 'patch', id, values }]);
    };

    const patchSection = (id: string, values: Partial<Section>): void => {
      set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...values } : s)) });
      persist([{ table: 'sections', kind: 'patch', id, values }]);
    };

    const reload = (): Promise<void> =>
      run(async () => {
        const id = get().listId;
        if (!id) return;
        const [sections, items, storeOrders] = await Promise.all([
          db.sections.toArray(),
          db.items.toArray(),
          db.store_orders.toArray(),
        ]);
        // A local change was made while reading. Its write is queued behind
        // this read, so read again after it instead of overwriting memory.
        if (writes > 0) {
          void reload();
          return;
        }
        set({
          sections: sections.filter((s) => s.list_id === id && !s.deleted_at),
          items: items.filter((i) => i.list_id === id && !i.deleted_at),
          storeOrders: storeOrders.filter((o) => o.list_id === id),
          ready: true,
        });
      });

    return {
      listId: null,
      sections: [],
      items: [],
      storeOrders: [],
      ready: false,

      load: (id) => {
        set({ listId: id });
        return reload();
      },
      reload,
      idle: () => queue,

      addItem: (sectionId, text, afterId = null) => {
        const all = get().items.filter((i) => i.section_id === sectionId).sort(byManual);
        const at = afterId ? all.findIndex((i) => i.id === afterId) : -1;
        const before = at >= 0 ? all[at].position : (all[all.length - 1]?.position ?? null);
        const after = at >= 0 ? (all[at + 1]?.position ?? null) : null;
        const row: Item = {
          id: newId(),
          list_id: listId(),
          section_id: sectionId,
          text,
          position: positionBetween(before, after),
          checked: false,
          checked_at: null,
          checked_store: null,
          category: null,
          updated_at: now(),
          deleted_at: null,
        };
        set({ items: [...get().items, row] });
        persist([{ table: 'items', kind: 'insert', id: row.id, values: { ...row } }]);
        return row.id;
      },

      addItems: (sectionId, texts) => texts.map((text) => get().addItem(sectionId, text)),

      setItemText: (id, text) => {
        const item = findItem(id);
        if (!item || item.text === text) return;
        patchItem(id, { text, category: null });
      },

      setCategory: (id, category, forText) => {
        const item = findItem(id);
        if (!item || item.text !== forText || item.category === category) return;
        patchItem(id, { category });
      },

      checkItem: (id, storeId) => {
        const item = findItem(id);
        if (!item || item.checked) return;
        patchItem(id, { checked: true, checked_at: now(), checked_store: storeId });
      },

      uncheckItem: (id) => {
        const item = findItem(id);
        if (!item || !item.checked) return;
        patchItem(id, { checked: false, checked_at: null, checked_store: null });
      },

      moveItem: (id, toIndex) => {
        const item = findItem(id);
        if (!item) return;
        const rest = sortOpen(
          get().items.filter((i) => i.section_id === item.section_id),
          null,
        ).filter((i) => i.id !== id);
        const before = rest[toIndex - 1]?.position ?? null;
        const after = rest[toIndex]?.position ?? null;
        patchItem(id, { position: positionBetween(before, after) });
      },

      deleteItem: (id) => {
        if (!findItem(id)) return;
        set({ items: get().items.filter((i) => i.id !== id) });
        persist([{ table: 'items', kind: 'patch', id, values: { deleted_at: now() } }]);
      },

      clearDone: (sectionId) => {
        const done = get().items.filter((i) => i.section_id === sectionId && i.checked);
        if (done.length === 0) return;
        const current = Object.fromEntries(get().storeOrders.map((o) => [o.store_id, o.scores]));
        const learned = learnFromDone(done, stores, current);
        const stamp = now();
        const ops: Op[] = [];
        const orders = get().storeOrders.filter((o) => !(o.store_id in learned));
        for (const [store_id, scores] of Object.entries(learned)) {
          const row: StoreOrder = { list_id: listId(), store_id, scores, updated_at: stamp };
          orders.push(row);
          ops.push({ table: 'store_orders', kind: 'upsert', id: store_id, values: { ...row } });
        }
        for (const item of done) {
          ops.push({ table: 'items', kind: 'patch', id: item.id, values: { deleted_at: stamp } });
        }
        const gone = new Set(done.map((i) => i.id));
        set({ items: get().items.filter((i) => !gone.has(i.id)), storeOrders: orders });
        persist(ops);
      },

      addSection: (title = '') => {
        const last = [...get().sections].sort(byManual).at(-1);
        const row: Section = {
          id: newId(),
          list_id: listId(),
          title,
          position: positionBetween(last?.position ?? null, null),
          store_sort: false,
          updated_at: now(),
          deleted_at: null,
        };
        set({ sections: [...get().sections, row] });
        persist([{ table: 'sections', kind: 'insert', id: row.id, values: { ...row } }]);
        return row.id;
      },

      renameSection: (id, title) => {
        const section = findSection(id);
        if (!section || section.title === title) return;
        patchSection(id, { title });
      },

      setStoreSort: (id, on) => {
        const section = findSection(id);
        if (!section || section.store_sort === on) return;
        patchSection(id, { store_sort: on });
      },

      deleteSection: (id) => {
        if (!findSection(id)) return;
        const stamp = now();
        const items = get().items.filter((i) => i.section_id === id);
        set({
          sections: get().sections.filter((s) => s.id !== id),
          items: get().items.filter((i) => i.section_id !== id),
        });
        persist([
          ...items.map((i): Op => ({ table: 'items', kind: 'patch', id: i.id, values: { deleted_at: stamp } })),
          { table: 'sections', kind: 'patch', id, values: { deleted_at: stamp } },
        ]);
      },
    };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/state/noteStore.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add note store with local persistence and outbox"
```

---

### Task 7: Item line

**Files:**
- Create: `src/ui/ItemLine.tsx`
- Test: `src/ui/ItemLine.test.tsx`

**Interfaces:**
- Consumes: `Item`, `makeItem`.
- Produces: `ItemLine(props: ItemLineProps)` where

```ts
export type ItemLineProps = {
  item: Item;
  wantFocus: boolean;        // true for one render to move focus here
  onFocused(): void;         // called after focus was moved because of wantFocus
  onFocus(): void;           // the line gained focus
  onBlur(text: string): void;     // the line lost focus; text is what was typed
  onEnter(text: string): void;
  onBackspaceEmpty(): void;
  onArrow(dir: -1 | 1): void;
  onToggle(): void;
};
```

The text field is a one-row `textarea` with accessible name `Item` that grows with its content. The checkbox has role `checkbox` and name `` `Check ${item.text}` ``. Text is kept as a local draft while the line is focused and handed to the parent on blur or Enter.

- [ ] **Step 1: Write the failing tests**

`src/ui/ItemLine.test.tsx`:

```tsx
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

  it('commits the text and then toggles when the checkbox is tapped while editing', async () => {
    const { field, props, user } = setup();
    await user.type(field, '!');
    await user.click(screen.getByRole('checkbox'));
    expect(props.onBlur).toHaveBeenCalledWith('Milk!');
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/ItemLine.test.tsx`
Expected: FAIL, cannot resolve `./ItemLine`.

- [ ] **Step 3: Write the implementation**

`src/ui/ItemLine.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Item } from '../domain/types';

export type ItemLineProps = {
  item: Item;
  wantFocus: boolean;
  onFocused(): void;
  onFocus(): void;
  onBlur(text: string): void;
  onEnter(text: string): void;
  onBackspaceEmpty(): void;
  onArrow(dir: -1 | 1): void;
  onToggle(): void;
};

export function ItemLine(props: ItemLineProps) {
  const { item, wantFocus } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  const editing = useRef(false);
  const [draft, setDraft] = useState(item.text);

  // Take changes from outside only while the line is not being edited.
  useEffect(() => {
    if (!editing.current) setDraft(item.text);
  }, [item.text]);

  // Grow with the content so long text wraps instead of scrolling sideways.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // A layout effect runs inside the tap or key handler that asked for focus,
  // which is what lets iOS keep the keyboard open.
  useLayoutEffect(() => {
    const el = field.current;
    if (!wantFocus || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    props.onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const el = event.currentTarget;
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onEnter(draft);
    } else if (event.key === 'Backspace' && draft === '') {
      event.preventDefault();
      props.onBackspaceEmpty();
    } else if (event.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault();
      props.onArrow(-1);
    } else if (event.key === 'ArrowDown' && el.selectionStart === draft.length) {
      event.preventDefault();
      props.onArrow(1);
    }
  };

  const toggle = () => {
    if (editing.current) field.current?.blur();
    props.onToggle();
  };

  return (
    <div
      className="flex min-h-9 items-start gap-2.5 px-4"
      data-item-id={item.id}
      onClick={() => field.current?.focus()}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Check ${item.text}`}
        className="mt-[7px] size-[22px] shrink-0 rounded-full border-[1.5px] border-line"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      />
      <textarea
        ref={field}
        rows={1}
        value={draft}
        aria-label="Item"
        autoCapitalize="sentences"
        enterKeyHint="next"
        className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[7px] text-[16px] leading-[22px] caret-notes-ink outline-none"
        onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
        onKeyDown={onKeyDown}
        onFocus={() => {
          editing.current = true;
          props.onFocus();
        }}
        onBlur={() => {
          editing.current = false;
          props.onBlur(draft);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/ItemLine.test.tsx && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add editable item line"
```

---

### Task 8: Note view — sections, editing, store picker, Done group

**Files:**
- Create: `src/state/deviceSettings.ts`, `src/state/uiStore.ts`, `src/state/context.tsx`, `src/ui/StorePicker.tsx`, `src/ui/DoneGroup.tsx`, `src/ui/SectionMenu.tsx`, `src/ui/SectionView.tsx`, `src/ui/NoteView.tsx`
- Test: `src/state/deviceSettings.test.ts`, `src/ui/NoteView.test.tsx`

**Interfaces:**
- Consumes: `NoteStore`, `NoteState`, `NoteActions`, `ItemLine`, `sortOpen`, `sortDone`, `byManual`, `Hold`, `effectiveOrder`, `STORES`, `getStore`, `makeStore`, shadcn `dropdown-menu` and `alert-dialog`.
- Produces:
  - `readSetting(key: string): string | null`, `writeSetting(key: string, value: string | null): void` — `localStorage` under the prefix `storenotes.`; never throw.
  - `useUi` Zustand hook with state `{ focusId: string | null; hold: Hold | null; storeId: string | null; quickAddSectionId: string | null }` and actions `requestFocus(id: string | null)`, `setHold(hold: Hold | null)`, `setStoreId(id: string | null)`, `setQuickAddSectionId(id: string | null)`. `storeId` and `quickAddSectionId` are persisted with `writeSetting`.
  - `NoteStoreProvider` (context provider taking `value: NoteStore`), `useNoteStore(): NoteStore`, `useNote<T>(selector): T`.
  - `NoteView(props: { header?: ReactNode })`.
  - Accessible names used by later tasks and tests: section element has role `region` named by its title; title input is `Section title`; the tap area under the list is `` `Add item to ${title}` ``; Done rows are checkboxes named `` `Uncheck ${text}` ``; store buttons sit in a group named `Store`.

- [ ] **Step 1: Write the failing tests**

`src/state/deviceSettings.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSetting, writeSetting } from './deviceSettings';

afterEach(() => vi.restoreAllMocks());

describe('deviceSettings', () => {
  it('writes, reads and removes a value', () => {
    writeSetting('storeId', 'store-a');
    expect(readSetting('storeId')).toBe('store-a');
    expect(localStorage.getItem('storenotes.storeId')).toBe('store-a');
    writeSetting('storeId', null);
    expect(readSetting('storeId')).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSetting('storeId')).toBeNull();
    expect(() => writeSetting('storeId', 'x')).not.toThrow();
  });
});
```

`src/ui/NoteView.test.tsx`:

```tsx
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Category } from '../domain/categories';
import { sortOpen } from '../domain/sort';
import { STORES } from '../domain/stores';
import { NoteStoreProvider } from '../state/context';
import type { NoteActions, NoteState } from '../state/noteStore';
import { useUi } from '../state/uiStore';
import { makeStore } from '../test/helpers';
import { NoteView } from './NoteView';

beforeEach(() => {
  useUi.setState({ focusId: null, hold: null, storeId: null, quickAddSectionId: null });
});

async function setup(seed?: (note: NoteState & NoteActions, sectionId: string) => void) {
  const { store } = await makeStore();
  const sectionId = store.getState().addSection('Grocery List');
  store.getState().setStoreSort(sectionId, true);
  seed?.(store.getState(), sectionId);
  render(
    <NoteStoreProvider value={store}>
      <NoteView />
    </NoteStoreProvider>,
  );
  return { store, sectionId, user: userEvent.setup() };
}

const fields = () => screen.queryAllByRole('textbox', { name: 'Item' }) as HTMLTextAreaElement[];
const lines = () => fields().map((el) => el.value);
const seedAC = (note: NoteState & NoteActions, sectionId: string) => {
  note.addItems(sectionId, ['A', 'C']);
};

describe('editing', () => {
  it('shows items in manual order', async () => {
    await setup(seedAC);
    expect(lines()).toEqual(['A', 'C']);
  });

  it('opens a focused line below on Enter and keeps what is typed there', async () => {
    const { store, user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    expect(lines()).toEqual(['A', '', 'C']);
    expect(document.activeElement).toBe(fields()[1]);
    await user.keyboard('B');
    await user.tab();
    expect(lines()).toEqual(['A', 'B', 'C']);
    expect(sortOpen(store.getState().items, null).map((i) => i.text)).toEqual(['A', 'B', 'C']);
  });

  it('deletes an empty line on Backspace and focuses the line above', async () => {
    const { user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    await user.keyboard('{Backspace}');
    expect(lines()).toEqual(['A', 'C']);
    expect(document.activeElement).toBe(fields()[0]);
  });

  it('removes an empty line when it loses focus', async () => {
    const { store, user } = await setup(seedAC);
    await user.type(fields()[0], '{Enter}');
    await user.click(screen.getByRole('textbox', { name: 'Section title' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(store.getState().items).toHaveLength(2);
  });

  it('starts a new line at the end when the space under the list is tapped', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('button', { name: 'Add item to Grocery List' }));
    expect(document.activeElement).toBe(fields()[2]);
    await user.keyboard('Z');
    await user.tab();
    expect(sortOpen(store.getState().items, null).map((i) => i.text)).toEqual(['A', 'C', 'Z']);
  });

  it('moves focus between lines with the arrow keys', async () => {
    const { user } = await setup(seedAC);
    await user.click(fields()[0]);
    fields()[0].setSelectionRange(1, 1);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(fields()[1]);
  });
});

describe('checking off', () => {
  it('moves a checked item to Done and back when the Done item is tapped', async () => {
    const { user } = await setup(seedAC);
    await user.click(screen.getByRole('checkbox', { name: 'Check A' }));
    expect(lines()).toEqual(['C']);
    await user.click(screen.getByRole('checkbox', { name: 'Uncheck A' }));
    expect(lines()).toEqual(['A', 'C']);
    expect(screen.queryByRole('checkbox', { name: 'Uncheck A' })).toBeNull();
  });

  it('clears Done items', async () => {
    const { store, user } = await setup(seedAC);
    await user.click(screen.getByRole('checkbox', { name: 'Check A' }));
    await user.click(screen.getByRole('button', { name: 'Clear done' }));
    expect(store.getState().items.map((i) => i.text)).toEqual(['C']);
    expect(screen.queryByRole('button', { name: 'Clear done' })).toBeNull();
  });
});

describe('store order', () => {
  // Written against whatever the first store is, so the tests still hold when
  // Task 15 replaces the example stores with the real ones.
  const STORE = STORES[0];
  const TAGGED: [string, Category][] = [
    ['Ice', 'frozen'],
    ['Milk', 'dairy'],
    ['Apple', 'produce'],
  ];
  const inStoreOrder = [...TAGGED]
    .sort((a, b) => STORE.baseline.indexOf(a[1]) - STORE.baseline.indexOf(b[1]))
    .map(([text]) => text);

  const seedTagged = (note: NoteState & NoteActions, sectionId: string) => {
    const [ice, milk, , apple] = note.addItems(sectionId, ['Ice', 'Milk', 'New', 'Apple']);
    note.setCategory(ice, 'frozen', 'Ice');
    note.setCategory(milk, 'dairy', 'Milk');
    note.setCategory(apple, 'produce', 'Apple');
  };

  it('sorts by the chosen store and returns to manual order with No store', async () => {
    const { user } = await setup(seedTagged);
    expect(lines()).toEqual(['Ice', 'Milk', 'New', 'Apple']);
    await user.click(screen.getByRole('button', { name: STORE.name }));
    expect(lines()).toEqual(['New', ...inStoreOrder]);
    expect(screen.getByRole('button', { name: STORE.name })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'No store' }));
    expect(lines()).toEqual(['Ice', 'Milk', 'New', 'Apple']);
  });

  it('records the chosen store on a checked item', async () => {
    const { store, user } = await setup(seedTagged);
    await user.click(screen.getByRole('button', { name: STORE.name }));
    await user.click(screen.getByRole('checkbox', { name: 'Check Milk' }));
    expect(store.getState().items.find((i) => i.text === 'Milk')?.checked_store).toBe(STORE.id);
  });

  it('shows no store picker in a section with store sort off', async () => {
    const { store } = await setup(seedAC);
    act(() => {
      store.getState().addSection('Gifts');
    });
    const gifts = screen.getByRole('region', { name: 'Gifts' });
    expect(within(gifts).queryByRole('group', { name: 'Store' })).toBeNull();
    const grocery = screen.getByRole('region', { name: 'Grocery List' });
    expect(within(grocery).getByRole('group', { name: 'Store' })).toBeInTheDocument();
  });
});

describe('sections', () => {
  it('adds a section and focuses its title', async () => {
    const { store, user } = await setup();
    await user.click(screen.getByRole('button', { name: '+ New section' }));
    expect(store.getState().sections).toHaveLength(2);
    const titles = screen.getAllByRole('textbox', { name: 'Section title' });
    expect(document.activeElement).toBe(titles[1]);
    await user.keyboard('Gifts');
    await user.tab();
    expect(store.getState().sections.map((s) => s.title)).toContain('Gifts');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/deviceSettings.test.ts src/ui/NoteView.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the state helpers**

`src/state/deviceSettings.ts`:

```ts
const PREFIX = 'storenotes.';

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage can be unavailable (private mode). The setting is then per session.
  }
}
```

`src/state/uiStore.ts`:

```ts
import { create } from 'zustand';
import type { Hold } from '../domain/sort';
import { readSetting, writeSetting } from './deviceSettings';

type UiState = {
  focusId: string | null;
  hold: Hold | null;
  storeId: string | null;
  quickAddSectionId: string | null;
  requestFocus(id: string | null): void;
  setHold(hold: Hold | null): void;
  setStoreId(id: string | null): void;
  setQuickAddSectionId(id: string | null): void;
};

export const useUi = create<UiState>()((set) => ({
  focusId: null,
  hold: null,
  storeId: readSetting('storeId'),
  quickAddSectionId: readSetting('quickAddSectionId'),
  requestFocus: (focusId) => set({ focusId }),
  setHold: (hold) => set({ hold }),
  setStoreId: (storeId) => {
    writeSetting('storeId', storeId);
    set({ storeId });
  },
  setQuickAddSectionId: (quickAddSectionId) => {
    writeSetting('quickAddSectionId', quickAddSectionId);
    set({ quickAddSectionId });
  },
}));
```

`src/state/context.tsx`:

```tsx
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { NoteActions, NoteState, NoteStore } from './noteStore';

const NoteStoreContext = createContext<NoteStore | null>(null);

export const NoteStoreProvider = NoteStoreContext.Provider;

export function useNoteStore(): NoteStore {
  const store = useContext(NoteStoreContext);
  if (!store) throw new Error('NoteStoreProvider is missing');
  return store;
}

// Selectors must return a value held in the store (not a new array or object),
// or the component re-renders forever. Derive lists with useMemo instead.
export function useNote<T>(selector: (state: NoteState & NoteActions) => T): T {
  return useStore(useNoteStore(), selector);
}
```

- [ ] **Step 4: Write the small components**

`src/ui/StorePicker.tsx`:

```tsx
import { STORES, getStore } from '../domain/stores';

type Props = { value: string | null; onChange(id: string | null): void };

export function StorePicker({ value, onChange }: Props) {
  const active = getStore(value)?.id ?? null;
  const options: { id: string | null; name: string }[] = [
    { id: null, name: 'No store' },
    ...STORES.map((store) => ({ id: store.id, name: store.name })),
  ];
  return (
    <div role="group" aria-label="Store" className="flex gap-3 text-[13px]">
      {options.map((option) => (
        <button
          key={option.id ?? 'none'}
          type="button"
          aria-pressed={option.id === active}
          className={option.id === active ? 'font-semibold text-notes-ink' : 'text-ink-2'}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/DoneGroup.tsx`:

```tsx
import type { Item } from '../domain/types';

type Props = { items: Item[]; onUncheck(id: string): void; onClear(): void };

export function DoneGroup({ items, onUncheck, onClear }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1">
      <div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked
            aria-label={`Uncheck ${item.text}`}
            className="flex min-h-9 w-full items-start gap-2.5 px-4 text-left"
            onClick={() => onUncheck(item.id)}
          >
            <span className="mt-[7px] grid size-[22px] shrink-0 place-items-center rounded-full bg-notes text-[13px] font-bold leading-none text-white">
              ✓
            </span>
            <span className="py-[8px] text-[14px] leading-5 text-ink-2">{item.text}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ml-[50px] mt-1 text-[13px] text-notes-ink" onClick={onClear}>
        Clear done
      </button>
    </div>
  );
}
```

`src/ui/SectionMenu.tsx`:

```tsx
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  title: string;
  storeSort: boolean;
  onStoreSort(on: boolean): void;
  onDelete(): void;
};

export function SectionMenu({ title, storeSort, onStoreSort, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Options for ${title || 'section'}`}
          className="shrink-0 px-1 text-[18px] leading-none text-ink-2"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={storeSort}
            onCheckedChange={(checked) => onStoreSort(checked === true)}
          >
            Sort by store
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onSelect={() => setConfirming(true)}>Delete section</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this section?</AlertDialogTitle>
            <AlertDialogDescription>Its items are deleted too.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 5: Write `SectionView` and `NoteView`**

`src/ui/SectionView.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { effectiveOrder } from '../domain/learning';
import { sortDone, sortOpen } from '../domain/sort';
import { getStore } from '../domain/stores';
import type { Item, Section } from '../domain/types';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { DoneGroup } from './DoneGroup';
import { ItemLine } from './ItemLine';
import { SectionMenu } from './SectionMenu';
import { StorePicker } from './StorePicker';

type TitleProps = {
  title: string;
  wantFocus: boolean;
  onFocused(): void;
  onCommit(title: string): void;
  onEnter(): void;
};

function SectionTitle({ title, wantFocus, onFocused, onCommit, onEnter }: TitleProps) {
  const field = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing.current) setDraft(title);
  }, [title]);

  useLayoutEffect(() => {
    if (!wantFocus) return;
    field.current?.focus();
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFocus]);

  return (
    <input
      ref={field}
      value={draft}
      aria-label="Section title"
      placeholder="Section"
      enterKeyHint="next"
      className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold leading-7 caret-notes-ink outline-none placeholder:text-ink-2"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        onCommit(draft.trim());
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter();
      }}
    />
  );
}

export function SectionView({ section }: { section: Section }) {
  // Actions are stable, so reading them once per render is safe.
  const note = useNoteStore().getState();
  const ui = useUi.getState();
  const items = useNote((s) => s.items);
  const storeOrders = useNote((s) => s.storeOrders);
  const focusId = useUi((s) => s.focusId);
  const hold = useUi((s) => s.hold);
  const storeId = useUi((s) => s.storeId);

  const mine = useMemo(() => items.filter((i) => i.section_id === section.id), [items, section.id]);

  const order = useMemo(() => {
    const store = section.store_sort ? getStore(storeId) : undefined;
    if (!store) return null;
    const scores = storeOrders.find((o) => o.store_id === store.id)?.scores;
    return effectiveOrder(store.baseline, scores);
  }, [section.store_sort, storeId, storeOrders]);

  const open = useMemo(() => sortOpen(mine, order, hold), [mine, order, hold]);
  const done = useMemo(() => sortDone(mine), [mine]);

  // Create an empty line, hold it at `index` and move focus to it.
  const startLine = (afterId: string | null, index: number) => {
    const id = note.addItem(section.id, '', afterId);
    ui.setHold({ id, index });
    ui.requestFocus(id);
  };

  const lineHandlers = (item: Item, index: number) => ({
    onFocused: () => ui.requestFocus(null),
    onFocus: () => {
      if (useUi.getState().hold?.id !== item.id) ui.setHold({ id: item.id, index });
    },
    onBlur: (text: string) => {
      if (useUi.getState().hold?.id === item.id) ui.setHold(null);
      const clean = text.trim();
      if (clean === '') note.deleteItem(item.id);
      else note.setItemText(item.id, clean);
    },
    onEnter: (text: string) => {
      const clean = text.trim();
      if (clean === '') {
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      note.setItemText(item.id, clean);
      startLine(item.id, index + 1);
    },
    onBackspaceEmpty: () => {
      const above = open[index - 1];
      if (above) {
        ui.setHold({ id: above.id, index: index - 1 });
        ui.requestFocus(above.id);
      } else {
        ui.setHold(null);
      }
      note.deleteItem(item.id);
    },
    onArrow: (dir: -1 | 1) => {
      const target = open[index + dir];
      if (target) ui.requestFocus(target.id);
    },
    onToggle: () =>
      note.checkItem(item.id, section.store_sort ? useUi.getState().storeId : null),
  });

  return (
    <section className="mt-5" aria-label={section.title || 'Untitled section'}>
      <div className="flex items-center gap-2 px-4">
        <SectionTitle
          title={section.title}
          wantFocus={focusId === section.id}
          onFocused={() => ui.requestFocus(null)}
          onCommit={(title) => note.renameSection(section.id, title)}
          onEnter={() => startLine(null, open.length)}
        />
        <SectionMenu
          title={section.title}
          storeSort={section.store_sort}
          onStoreSort={(on) => note.setStoreSort(section.id, on)}
          onDelete={() => note.deleteSection(section.id)}
        />
      </div>
      {section.store_sort && (
        <div className="px-4 pb-1">
          <StorePicker value={storeId} onChange={ui.setStoreId} />
        </div>
      )}
      <div>
        {open.map((item, index) => (
          <ItemLine
            key={item.id}
            item={item}
            wantFocus={focusId === item.id}
            {...lineHandlers(item, index)}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label={`Add item to ${section.title || 'section'}`}
        className="block h-9 w-full"
        onClick={() => startLine(null, open.length)}
      />
      <DoneGroup
        items={done}
        onUncheck={note.uncheckItem}
        onClear={() => note.clearDone(section.id)}
      />
    </section>
  );
}
```

`src/ui/NoteView.tsx`:

```tsx
import { useMemo, type ReactNode } from 'react';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { SectionView } from './SectionView';

export function NoteView({ header }: { header?: ReactNode }) {
  const store = useNoteStore();
  const sections = useNote((s) => s.sections);
  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);

  const addSection = () => {
    const id = store.getState().addSection();
    useUi.getState().requestFocus(id);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col pb-28 pt-[env(safe-area-inset-top)]">
      <header className="flex h-11 items-center justify-end gap-3 px-4">{header}</header>
      {sorted.map((section) => (
        <SectionView key={section.id} section={section} />
      ))}
      <button
        type="button"
        className="mx-4 mt-6 self-start text-[14px] text-notes-ink"
        onClick={addSection}
      >
        + New section
      </button>
    </main>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/state/deviceSettings.test.ts src/ui/NoteView.test.tsx && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add note view with sections, editing, store picker and Done group"
```

---

### Task 9: Quick-add bar

**Files:**
- Create: `src/ui/useKeyboardInset.ts`, `src/ui/QuickAddBar.tsx`
- Modify: `src/ui/NoteView.tsx`
- Test: `src/ui/QuickAddBar.test.tsx`

**Interfaces:**
- Consumes: `useNote`, `useNoteStore`, `useUi`, `parseQuickAdd`, `byManual`, `makeStore`, `readSetting`.
- Produces:
  - `useKeyboardInset(): number` — pixels the on-screen keyboard covers at the bottom of the layout viewport; `0` when `visualViewport` is unavailable.
  - `QuickAddBar()` — renders nothing when there are no sections. Field name `Add item`; add button name `Add`; section chip name starts with `Adding to`.

- [ ] **Step 1: Write the failing tests**

`src/ui/QuickAddBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sortOpen } from '../domain/sort';
import { NoteStoreProvider } from '../state/context';
import { readSetting } from '../state/deviceSettings';
import { useUi } from '../state/uiStore';
import { makeStore } from '../test/helpers';
import { QuickAddBar } from './QuickAddBar';

beforeEach(() => {
  useUi.setState({ focusId: null, hold: null, storeId: null, quickAddSectionId: null });
});

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
});

async function setup(sectionTitles = ['Grocery List', 'Gifts']) {
  const { store } = await makeStore();
  const sectionIds = sectionTitles.map((title) => store.getState().addSection(title));
  const view = render(
    <NoteStoreProvider value={store}>
      <QuickAddBar />
    </NoteStoreProvider>,
  );
  const textsIn = (sectionId: string) =>
    sortOpen(store.getState().items.filter((i) => i.section_id === sectionId), null).map((i) => i.text);
  return { store, sectionIds, textsIn, user: userEvent.setup(), container: view.container };
}

const field = () => screen.getByRole('textbox', { name: 'Add item' }) as HTMLTextAreaElement;

describe('QuickAddBar', () => {
  it('adds on Enter, clears the field and keeps focus', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.type(field(), 'Milk{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk']);
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
    await user.keyboard('Eggs{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk', 'Eggs']);
  });

  it('adds one item per comma or line break', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.click(field());
    await user.paste('Milk, Eggs\nBread');
    await user.keyboard('{Enter}');
    expect(textsIn(sectionIds[0])).toEqual(['Milk', 'Eggs', 'Bread']);
  });

  it('adds nothing for whitespace', async () => {
    const { store, user } = await setup();
    await user.type(field(), '   {Enter}');
    expect(store.getState().items).toEqual([]);
  });

  it('adds with the + button and keeps focus in the field', async () => {
    const { textsIn, sectionIds, user } = await setup();
    await user.type(field(), 'Milk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(textsIn(sectionIds[0])).toEqual(['Milk']);
    expect(document.activeElement).toBe(field());
  });

  it('switches target section with the chip and remembers the last one used', async () => {
    const { textsIn, sectionIds, user } = await setup();
    const chip = () => screen.getByRole('button', { name: /^Adding to/ });
    expect(chip()).toHaveTextContent('Grocery List');
    await user.click(chip());
    expect(chip()).toHaveTextContent('Gifts');
    await user.type(field(), 'Lego{Enter}');
    expect(textsIn(sectionIds[1])).toEqual(['Lego']);
    expect(readSetting('quickAddSectionId')).toBe(sectionIds[1]);
    await user.click(chip());
    expect(chip()).toHaveTextContent('Grocery List');
  });

  it('renders nothing when there are no sections', async () => {
    const { container } = await setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('sits above the on-screen keyboard', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
      configurable: true,
    });
    const { container } = await setup();
    expect((container.firstElementChild as HTMLElement).style.bottom).toBe('300px');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/QuickAddBar.test.tsx`
Expected: FAIL, cannot resolve `./QuickAddBar`.

- [ ] **Step 3: Write the implementation**

`src/ui/useKeyboardInset.ts`:

```ts
import { useEffect, useState } from 'react';

// On iPhone a fixed bar at the bottom ends up behind the keyboard. The visual
// viewport tells us how much of the layout viewport the keyboard covers.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
```

`src/ui/QuickAddBar.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { parseQuickAdd } from '../domain/parseQuickAdd';
import { byManual } from '../domain/sort';
import { useNote, useNoteStore } from '../state/context';
import { useUi } from '../state/uiStore';
import { useKeyboardInset } from './useKeyboardInset';

export function QuickAddBar() {
  const note = useNoteStore().getState();
  const sections = useNote((s) => s.sections);
  const chosen = useUi((s) => s.quickAddSectionId);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const inset = useKeyboardInset();

  const sorted = useMemo(() => [...sections].sort(byManual), [sections]);
  const target = sorted.find((s) => s.id === chosen) ?? sorted[0];
  if (!target) return null;
  const name = target.title || 'Untitled';

  const submit = () => {
    const parts = parseQuickAdd(text);
    if (parts.length === 0) return;
    note.addItems(target.id, parts);
    useUi.getState().setQuickAddSectionId(target.id);
    setText('');
    field.current?.focus();
  };

  const nextSection = () => {
    const at = sorted.findIndex((s) => s.id === target.id);
    useUi.getState().setQuickAddSectionId(sorted[(at + 1) % sorted.length].id);
  };

  // Tapping a button must not take focus from the field, or the keyboard closes.
  const keepFocus = { onMouseDown: (e: { preventDefault(): void }) => e.preventDefault() };

  return (
    <div
      className="fixed inset-x-0 z-10 border-t border-line bg-page"
      style={{ bottom: inset, paddingBottom: inset > 0 ? 0 : 'env(safe-area-inset-bottom)' }}
    >
      <form
        className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          aria-label={`Adding to ${name}. Tap to change section`}
          className="max-w-[35%] shrink-0 truncate text-[13px] text-notes-ink"
          onClick={nextSection}
          {...keepFocus}
        >
          {name}
        </button>
        <textarea
          ref={field}
          rows={1}
          value={text}
          aria-label="Add item"
          placeholder="Add item"
          enterKeyHint="done"
          autoCapitalize="sentences"
          className="min-w-0 flex-1 resize-none bg-transparent py-1 text-[16px] leading-[22px] caret-notes-ink outline-none placeholder:text-ink-2"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
        />
        <button
          type="submit"
          aria-label="Add"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-notes text-[18px] font-semibold leading-none text-black"
          {...keepFocus}
        >
          +
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the bar to `NoteView`**

In `src/ui/NoteView.tsx`, add the import:

```tsx
import { QuickAddBar } from './QuickAddBar';
```

and render it as the last child of `<main>`, directly after the `+ New section` button:

```tsx
      <QuickAddBar />
    </main>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all tests pass, including the Task 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add quick-add bar"
```

---

### Task 10: Motion and drag to reorder

**Files:**
- Create: `src/ui/motion.ts`
- Modify: `src/ui/SectionView.tsx`, `src/ui/DoneGroup.tsx`, `src/test/setup.ts`
- Test: `src/ui/NoteView.test.tsx` (add one `describe`)

**Interfaces:**
- Consumes: `NoteActions.moveItem(id, toIndex)`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@formkit/auto-animate/react`.
- Produces: each open item is wrapped in a row element with `data-draggable="true"` in manual view and `"false"` when a store is selected. `MOTION = { duration: 180, easing: 'ease-out' }`.

Behaviour:
- Items animate for 180ms when they are added, removed or reordered (check-off, uncheck, store change, changes from the other person). `auto-animate` turns itself off when Reduce Motion is on.
- Long-press (300ms) and drag reorders within a section. Only touch starts a drag, so selecting text with a mouse still works. Dragging is off in a store-sorted view.

- [ ] **Step 1: Mock the animation library in tests**

jsdom has no Web Animations API. Append to `src/test/setup.ts`:

```ts
import { vi } from 'vitest';

vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [() => {}, () => {}],
}));
```

- [ ] **Step 2: Write the failing test**

Append to `src/ui/NoteView.test.tsx`:

```tsx
describe('reordering', () => {
  const rows = () => Array.from(document.querySelectorAll('[data-draggable]'));

  it('allows dragging in manual order only', async () => {
    const { user } = await setup(seedAC);
    expect(rows()).toHaveLength(2);
    expect(rows().every((row) => row.getAttribute('data-draggable') === 'true')).toBe(true);
    await user.click(screen.getByRole('button', { name: STORES[0].name }));
    expect(rows().every((row) => row.getAttribute('data-draggable') === 'false')).toBe(true);
  });
});
```

Run: `npx vitest run src/ui/NoteView.test.tsx`
Expected: FAIL, `rows()` has length 0.

- [ ] **Step 3: Write the implementation**

`src/ui/motion.ts`:

```ts
export const MOTION = { duration: 180, easing: 'ease-out' };
```

In `src/ui/DoneGroup.tsx`, add the imports:

```tsx
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { MOTION } from './motion';
```

Add as the first line of the `DoneGroup` function body (before the early return, so the hook always runs):

```tsx
  const [list] = useAutoAnimate<HTMLDivElement>(MOTION);
```

and attach it to the inner `<div>` that wraps the Done rows:

```tsx
      <div ref={list}>
```

In `src/ui/SectionView.tsx`, add the imports:

```tsx
import type { ReactNode } from 'react';
import { DndContext, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { MOTION } from './motion';
```

Add this component above `SectionView`:

```tsx
function Row({ id, draggable, children }: { id: string; draggable: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      data-draggable={draggable}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...(draggable ? listeners : {})}
    >
      {children}
    </div>
  );
}
```

Inside `SectionView`, after the `done` memo, add:

```tsx
  const manual = order === null;
  const [openList, animateOpen] = useAutoAnimate<HTMLDivElement>(MOTION);
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );

  // dnd-kit moves rows itself while dragging; pause auto-animate so the two
  // do not animate the same rows.
  const onDragStart = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    animateOpen(false);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    const to = overId === undefined ? -1 : open.findIndex((i) => i.id === overId);
    if (to >= 0 && overId !== event.active.id) note.moveItem(String(event.active.id), to);
    requestAnimationFrame(() => animateOpen(true));
  };
```

Replace the block that renders the open items (`<div>{open.map(...)}</div>`) with:

```tsx
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => animateOpen(true)}
      >
        <SortableContext items={open.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div ref={openList}>
            {open.map((item, index) => (
              <Row key={item.id} id={item.id} draggable={manual}>
                <ItemLine
                  item={item}
                  wantFocus={focusId === item.id}
                  {...lineHandlers(item, index)}
                />
              </Row>
            ))}
          </div>
        </SortableContext>
      </DndContext>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all tests pass.

- [ ] **Step 5: Look at it**

Temporarily render the note with a local-only store so the UI can be seen before sync exists. Replace `src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { NoteStoreProvider } from './state/context';
import { createNoteStore, type NoteStore } from './state/noteStore';
import { LocalDb } from './sync/localDb';
import { Outbox } from './sync/outbox';
import { NoteView } from './ui/NoteView';

export function App() {
  const [store, setStore] = useState<NoteStore | null>(null);

  useEffect(() => {
    const db = new LocalDb('storenotes-preview');
    const preview = createNoteStore({ db, outbox: new Outbox(db) });
    void preview
      .getState()
      .load('preview')
      .then(() => {
        if (preview.getState().sections.length === 0) {
          const id = preview.getState().addSection('Grocery List');
          preview.getState().setStoreSort(id, true);
        }
        setStore(preview);
      });
  }, []);

  if (!store) return null;
  return (
    <NoteStoreProvider value={store}>
      <NoteView />
    </NoteStoreProvider>
  );
}
```

Replace `src/App.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('shows the note with a grocery section', async () => {
  render(<App />);
  expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
});
```

Run: `npm test`, then `npm run dev` and open the printed URL in a browser at phone width.

Check by hand and fix anything that is off before committing:
- Item text is 16px, section title 20px semibold, Done text and store picker 13–14px.
- Rows are 36px tall; tapping anywhere on a row focuses it.
- No boxes or shadows; yellow is used only for checked circles, the caret, `+`, the chip and `Clear done`.
- Dark mode follows the system setting.
- Adding with the bar, Enter for new lines, Backspace on empty, check, uncheck, `Clear done`, store switch all respond at once.
- The `⋯` menu on a section: `Sort by store` shows and hides the store picker; `Delete section` asks first and then removes the section and its items.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add motion and long-press drag to reorder"
```

---

### Task 11: Supabase schema and access rules

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/20261008000000_init.sql`, `vitest.db.config.ts`
- Modify: `package.json` (script `test:db`, dev dependency `supabase`)
- Test: `supabase/tests/access.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Tables `lists`, `list_members`, `list_invites`, `sections`, `items`, `store_orders`, `category_cache` with the columns in the spec's data model.
  - `bootstrap() returns uuid` — accepts invites for the caller's email, then returns the caller's list id, creating a list with a `Grocery List` section (store sort on) if they have none. A list shared with the caller is preferred over one they created.
  - `accept_invites() returns void`
  - `list_people(l uuid) returns table (email text, pending boolean)` — members (`pending = false`) and invites (`pending = true`); empty for non-members.
  - Row-level security: members only. `category_cache` is closed to clients.
  - Triggers: `updated_at` set on every write to `sections`, `items`, `store_orders`; a row with `deleted_at` set can never have it cleared.
  - Realtime enabled on `sections`, `items`, `store_orders`.
  - `npm run test:db` runs the database tests against the local Supabase stack.

**Prerequisite:** Docker Desktop must be running; the local Supabase stack runs in it. If Docker is not installed, stop and tell Wictor.

- [ ] **Step 1: Set up the local Supabase project**

```bash
npm install -D supabase
npx supabase init
npx supabase start
```

If `init` asks about editor settings, answer no. Expected after `start`: a table of local URLs and keys. First start downloads images and takes a few minutes.

- [ ] **Step 2: Add the database test runner**

`vitest.db.config.ts`:

```ts
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Reads API_URL, ANON_KEY and SERVICE_ROLE_KEY from the running local stack.
function localSupabaseEnv(): Record<string, string> {
  const output = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const env: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
    env: localSupabaseEnv(),
  },
});
```

In `package.json`, add to `"scripts"`:

```json
"test:db": "vitest run --config vitest.db.config.ts"
```

- [ ] **Step 3: Write the failing tests**

`supabase/tests/access.test.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.API_URL!;
const anonKey = (process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY)!;
const serviceKey = (process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY)!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, noSession);
const run = Date.now();
const PASSWORD = 'test-password-123';

type Person = { client: SupabaseClient; email: string };

async function signedIn(name: string): Promise<Person> {
  const email = `${name}-${run}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, email };
}

async function bootstrap(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc('bootstrap');
  if (error) throw error;
  return data as string;
}

const newItem = (listId: string, sectionId: string, text: string) => ({
  id: crypto.randomUUID(),
  list_id: listId,
  section_id: sectionId,
  text,
  position: 'a0',
});

let anna: Person;
let bo: Person;
let cy: Person;
let listId: string;
let sectionId: string;

beforeAll(async () => {
  anna = await signedIn('anna');
  bo = await signedIn('bo');
  cy = await signedIn('cy');
  listId = await bootstrap(anna.client);
  const { data } = await anna.client.from('sections').select('id').eq('list_id', listId);
  sectionId = data![0].id;
});

describe('bootstrap', () => {
  it('creates one list with a Grocery List section and returns it every time', async () => {
    const { data } = await anna.client.from('sections').select('title, store_sort').eq('list_id', listId);
    expect(data).toEqual([{ title: 'Grocery List', store_sort: true }]);
    expect(await bootstrap(anna.client)).toBe(listId);
  });
});

describe('access rules', () => {
  it('lets a member write and read items', async () => {
    const write = await anna.client.from('items').insert(newItem(listId, sectionId, 'Milk'));
    expect(write.error).toBeNull();
    const read = await anna.client.from('items').select('text').eq('list_id', listId);
    expect(read.data).toEqual([{ text: 'Milk' }]);
  });

  it('hides the list from a non-member and refuses their writes', async () => {
    const read = await cy.client.from('items').select('id').eq('list_id', listId);
    expect(read.data).toEqual([]);
    const write = await cy.client.from('items').insert(newItem(listId, sectionId, 'Sneaky'));
    expect(write.error).not.toBeNull();
    const patch = await cy.client.from('items').update({ text: 'Changed' }).eq('list_id', listId).select();
    expect(patch.data).toEqual([]);
  });

  it('gives an invited person the shared list when they sign in', async () => {
    const invite = await anna.client.from('list_invites').insert({ list_id: listId, email: bo.email });
    expect(invite.error).toBeNull();
    expect(await bootstrap(bo.client)).toBe(listId);
    const read = await bo.client.from('items').select('text').eq('list_id', listId);
    expect(read.data).toEqual([{ text: 'Milk' }]);
    const left = await anna.client.from('list_invites').select('email').eq('list_id', listId);
    expect(left.data).toEqual([]);
  });

  it('does not let an uninvited person join', async () => {
    await cy.client.rpc('accept_invites');
    expect(await bootstrap(cy.client)).not.toBe(listId);
    const read = await cy.client.from('items').select('id').eq('list_id', listId);
    expect(read.data).toEqual([]);
  });

  it('lists members and pending invites to members only', async () => {
    const pendingEmail = `pending-${run}@example.test`;
    await anna.client.from('list_invites').insert({ list_id: listId, email: pendingEmail });
    const { data } = await anna.client.rpc('list_people', { l: listId });
    expect(data).toHaveLength(3);
    expect(data).toEqual(
      expect.arrayContaining([
        { email: anna.email, pending: false },
        { email: bo.email, pending: false },
        { email: pendingEmail, pending: true },
      ]),
    );
    const outsider = await cy.client.rpc('list_people', { l: listId });
    expect(outsider.data).toEqual([]);
  });

  it('keeps the category cache away from clients', async () => {
    await admin.from('category_cache').upsert({ text_key: `secret-${run}`, category: 'dairy' });
    const read = await anna.client.from('category_cache').select('*');
    expect(read.data ?? []).toEqual([]);
    const write = await anna.client.from('category_cache').insert({ text_key: `x-${run}`, category: 'dairy' });
    expect(write.error).not.toBeNull();
  });
});

describe('row rules', () => {
  it('keeps a deleted item deleted', async () => {
    const row = newItem(listId, sectionId, 'Temp');
    await anna.client.from('items').insert(row);
    await anna.client.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', row.id);
    await anna.client.from('items').update({ deleted_at: null, text: 'Back' }).eq('id', row.id);
    const { data } = await anna.client.from('items').select('text, deleted_at').eq('id', row.id);
    expect(data![0].text).toBe('Back');
    expect(data![0].deleted_at).not.toBeNull();
  });

  it('sets updated_at on every write, whatever the client sends', async () => {
    const row = { ...newItem(listId, sectionId, 'Stamp'), updated_at: '2000-01-01T00:00:00Z' };
    await anna.client.from('items').insert(row);
    const { data } = await anna.client.from('items').select('updated_at').eq('id', row.id);
    expect(new Date(data![0].updated_at).getFullYear()).toBeGreaterThan(2000);
  });

  it('ignores a repeated insert of the same row', async () => {
    const row = newItem(listId, sectionId, 'Once');
    await anna.client.from('items').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    await anna.client.from('items').update({ text: 'Edited' }).eq('id', row.id);
    const again = await anna.client.from('items').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    expect(again.error).toBeNull();
    const { data } = await anna.client.from('items').select('text').eq('id', row.id);
    expect(data![0].text).toBe('Edited');
  });
});
```

Run: `npm run test:db`
Expected: FAIL, `bootstrap` function not found.

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261008000000_init.sql`:

```sql
-- Tables ---------------------------------------------------------------------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our list',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (list_id, user_id)
);

create table public.list_invites (
  list_id uuid not null references public.lists (id) on delete cascade,
  email text not null check (email = lower(email)),
  primary key (list_id, email)
);

create table public.sections (
  id uuid primary key,
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null default '',
  position text not null,
  store_sort boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.items (
  id uuid primary key,
  list_id uuid not null references public.lists (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  text text not null default '',
  position text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_store text,
  category text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index items_list_id_idx on public.items (list_id);
create index sections_list_id_idx on public.sections (list_id);

create table public.store_orders (
  list_id uuid not null references public.lists (id) on delete cascade,
  store_id text not null,
  scores jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (list_id, store_id)
);

create table public.category_cache (
  text_key text primary key,
  category text not null,
  created_at timestamptz not null default now()
);

-- Row triggers ---------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.keep_deleted() returns trigger
language plpgsql as $$
begin
  if old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;

create trigger sections_touch before insert or update on public.sections
  for each row execute function public.touch_updated_at();
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_updated_at();
create trigger store_orders_touch before insert or update on public.store_orders
  for each row execute function public.touch_updated_at();

create trigger sections_keep_deleted before update on public.sections
  for each row execute function public.keep_deleted();
create trigger items_keep_deleted before update on public.items
  for each row execute function public.keep_deleted();

-- Functions ------------------------------------------------------------------

create function public.is_member(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = l and m.user_id = auth.uid()
  );
$$;

create function public.accept_invites() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
begin
  if me is null or mail is null then
    raise exception 'not signed in';
  end if;
  insert into public.list_members (list_id, user_id)
    select i.list_id, me from public.list_invites i where i.email = mail
    on conflict do nothing;
  delete from public.list_invites i where i.email = mail;
end $$;

create function public.bootstrap() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- One at a time per user, so two tabs cannot both create a first list.
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform public.accept_invites();

  select m.list_id into found
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.user_id = me
  order by (l.created_by = me), l.created_at
  limit 1;
  if found is not null then
    return found;
  end if;

  insert into public.lists (created_by) values (me) returning id into found;
  insert into public.list_members (list_id, user_id) values (found, me);
  insert into public.sections (id, list_id, title, position, store_sort)
    values (gen_random_uuid(), found, 'Grocery List', 'a0', true);
  return found;
end $$;

create function public.list_people(l uuid) returns table (email text, pending boolean)
language sql stable security definer set search_path = '' as $$
  select u.email::text, false
  from public.list_members m
  join auth.users u on u.id = m.user_id
  where m.list_id = l and public.is_member(l)
  union all
  select i.email, true
  from public.list_invites i
  where i.list_id = l and public.is_member(l);
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.accept_invites() from public, anon;
revoke execute on function public.bootstrap() from public, anon;
revoke execute on function public.list_people(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.bootstrap() to authenticated;
grant execute on function public.list_people(uuid) to authenticated;

-- Access rules ---------------------------------------------------------------

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.sections enable row level security;
alter table public.items enable row level security;
alter table public.store_orders enable row level security;
alter table public.category_cache enable row level security;

grant select on public.lists, public.list_members to authenticated;
grant select, insert, update, delete
  on public.list_invites, public.sections, public.items, public.store_orders
  to authenticated;
revoke all on public.category_cache from anon, authenticated;
grant all on public.category_cache to service_role;

create policy lists_select on public.lists
  for select to authenticated using (public.is_member(id));

create policy list_members_select on public.list_members
  for select to authenticated using (public.is_member(list_id));

create policy list_invites_all on public.list_invites
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy sections_all on public.sections
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy items_all on public.items
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

create policy store_orders_all on public.store_orders
  for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

-- Realtime -------------------------------------------------------------------

alter publication supabase_realtime
  add table public.sections, public.items, public.store_orders;
```

- [ ] **Step 5: Apply it and run the tests**

```bash
npx supabase db reset
npm run test:db
```

Expected: the reset applies the migration without errors; all database tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Supabase schema, access rules and database tests"
```

---

### Task 12: Sync engine

**Files:**
- Create: `src/sync/syncEngine.ts`, `src/sync/supabaseRemote.ts`, `src/sync/supabaseClient.ts`, `src/test/fakeRemote.ts`, `.env.example`
- Test: `src/sync/syncEngine.test.ts`

**Interfaces:**
- Consumes: `LocalDb`, `Outbox`, `Mutation`, `TableName`, domain types, `makeStore`.
- Produces:

```ts
export type Row = Record<string, unknown>;
export type RemoteResult = { ok: true } | { ok: false; permanent: boolean };
export type Snapshot = { sections: Section[]; items: Item[]; store_orders: StoreOrder[] };

export interface Remote {
  send(m: Mutation): Promise<RemoteResult>;
  fetchAll(listId: string): Promise<Snapshot | null>;   // null when unreachable
  subscribe(
    listId: string,
    onRow: (table: TableName, row: Row) => void,
    onRejoin: () => void,
  ): () => void;
}

export type SyncHooks = {
  onChange(): void;               // IndexedDB changed; reload memory
  onRejected(): void;             // the server refused a change for good
  onStatus?(pending: number): void;
};

export class SyncEngine {
  constructor(db: LocalDb, outbox: Outbox, remote: Remote, listId: string, hooks: SyncHooks);
  flush(): Promise<void>;                              // send queued changes in order
  refetch(): Promise<void>;                            // replace the local copy, keeping pending fields
  applyRemote(table: TableName, row: Row): Promise<void>;
  sync(): Promise<void>;                               // flush, then refetch
  start(): () => void;                                 // subscribe + listeners + first sync; returns stop
  stop(): void;
}
```

  - `supabaseRemote(sb: SupabaseClient): Remote`
  - `supabase` — the app's client, from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  - `FakeRemote` (tests only) — in-memory server with `mode: 'ok' | 'transient' | 'permanent'`, `offline: boolean`, `gate: Promise<void> | null`, `sent: Mutation[]`, `rows`.

Send rules (`supabaseRemote` and `FakeRemote` both follow them):
- `insert` → insert, ignoring the row if its id already exists.
- `patch` → update the named fields of the row with that id.
- `upsert` → insert or replace by `(list_id, store_id)`.
- A failure is permanent for HTTP 4xx except 401, 408 and 429. Everything else (no network, 5xx, expired session) is transient and retried.

- [ ] **Step 1: Write the fake remote**

`src/test/fakeRemote.ts`:

```ts
import type { Mutation, TableName } from '../sync/localDb';
import type { Remote, RemoteResult, Row, Snapshot } from '../sync/syncEngine';

// An in-memory stand-in for Supabase. Like Realtime, it echoes every accepted
// change to all subscribers, including the sender.
export class FakeRemote implements Remote {
  rows: Record<TableName, Map<string, Row>> = {
    sections: new Map(),
    items: new Map(),
    store_orders: new Map(),
  };
  mode: 'ok' | 'transient' | 'permanent' = 'ok';
  offline = false;
  gate: Promise<void> | null = null;
  sent: Mutation[] = [];
  private listeners = new Set<(table: TableName, row: Row) => void>();

  async send(m: Mutation): Promise<RemoteResult> {
    if (this.gate) await this.gate;
    if (this.mode !== 'ok') return { ok: false, permanent: this.mode === 'permanent' };
    this.sent.push(m);
    const table = this.rows[m.table];
    const current = table.get(m.id);
    if (m.kind === 'insert') {
      if (!current) table.set(m.id, { ...m.values });
    } else if (m.kind === 'upsert') {
      table.set(m.id, { ...m.values });
    } else if (current) {
      const next = { ...current, ...m.values };
      if (current.deleted_at) next.deleted_at = current.deleted_at;
      table.set(m.id, next);
    }
    const row = table.get(m.id);
    if (row) for (const listener of this.listeners) listener(m.table, { ...row });
    return { ok: true };
  }

  async fetchAll(): Promise<Snapshot | null> {
    if (this.offline) return null;
    const live = (table: TableName) =>
      [...this.rows[table].values()].filter((row) => !row.deleted_at).map((row) => ({ ...row }));
    return {
      sections: live('sections'),
      items: live('items'),
      store_orders: live('store_orders'),
    } as unknown as Snapshot;
  }

  subscribe(_listId: string, onRow: (table: TableName, row: Row) => void): () => void {
    this.listeners.add(onRow);
    return () => this.listeners.delete(onRow);
  }
}
```

- [ ] **Step 2: Write the failing tests**

`src/sync/syncEngine.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortOpen } from '../domain/sort';
import { FakeRemote } from '../test/fakeRemote';
import { makeStore } from '../test/helpers';
import { SyncEngine } from './syncEngine';

const engines: SyncEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.stop();
});

async function client(remote: FakeRemote, prefix: string) {
  let n = 0;
  const ctx = await makeStore({ newId: () => `${prefix}-${++n}` });
  const hooks = { onChange: vi.fn(), onRejected: vi.fn() };
  const engine = new SyncEngine(ctx.db, ctx.outbox, remote, 'list-1', hooks);
  engines.push(engine);
  const applying: Promise<void>[] = [];
  remote.subscribe('list-1', (table, row) => {
    applying.push(engine.applyRemote(table, row));
  });
  const s = () => ctx.store.getState();
  // Write local changes, send them, take in everything echoed back, reload memory.
  const settle = async () => {
    await s().idle();
    await engine.flush();
    await Promise.all(applying.splice(0));
    await s().reload();
  };
  return { ...ctx, engine, hooks, s, settle };
}

const texts = (c: Awaited<ReturnType<typeof client>>) => sortOpen(c.s().items, null).map((i) => i.text);

describe('flush', () => {
  it('sends queued changes in order and empties the outbox', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    a.s().checkItem(item, null);
    await a.settle();
    expect(remote.sent.map((m) => `${m.table}:${m.kind}`)).toEqual([
      'sections:insert',
      'items:insert',
      'items:patch',
    ]);
    expect(await a.outbox.count()).toBe(0);
    expect(remote.rows.items.get(item)).toMatchObject({ text: 'Milk', checked: true });
  });

  it('keeps changes queued when the network fails and sends them later', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    remote.mode = 'transient';
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'Milk');
    await a.settle();
    expect(remote.sent).toEqual([]);
    expect(await a.outbox.count()).toBe(2);
    remote.mode = 'ok';
    await a.settle();
    expect(await a.outbox.count()).toBe(0);
    expect(remote.rows.items.size).toBe(1);
  });

  it('drops a change the server refuses, reports it and restores the server state', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    await a.settle();
    remote.mode = 'permanent';
    a.s().addItem(section, 'Refused');
    await a.settle();
    expect(await a.outbox.count()).toBe(0);
    expect(a.hooks.onRejected).toHaveBeenCalledTimes(1);
    expect(texts(a)).toEqual([]);
    expect(a.s().sections).toHaveLength(1);
  });

  it('still sends an edit made while the insert of the same item is in flight', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    await a.settle();

    let open!: () => void;
    remote.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const item = a.s().addItem(section, 'Milk');
    await a.s().idle();
    const flushing = a.engine.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    a.s().setItemText(item, 'Oat milk');
    await a.s().idle();
    remote.gate = null;
    open();
    await flushing;
    await a.settle();

    expect(remote.rows.items.get(item)?.text).toBe('Oat milk');
    expect(await a.outbox.count()).toBe(0);
  });
});

describe('incoming changes', () => {
  it('keeps fields with a pending local change and takes the rest', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    await a.settle();

    remote.mode = 'transient';
    a.s().setItemText(item, 'Oat milk');
    await a.settle();

    await a.engine.applyRemote('items', { ...remote.rows.items.get(item)!, text: 'Mjölk', checked: true });
    await a.s().reload();
    expect(a.s().items[0]).toMatchObject({ text: 'Oat milk', checked: true });
    expect(a.hooks.onChange).toHaveBeenCalled();
  });

  it('removes a row that arrives deleted', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Milk');
    await a.settle();
    await a.engine.applyRemote('items', { ...remote.rows.items.get(item)!, deleted_at: '2026-10-08T11:00:00Z' });
    await a.s().reload();
    expect(a.s().items).toEqual([]);
    expect(await a.db.items.get(item)).toBeUndefined();
  });
});

describe('refetch', () => {
  it('drops rows the server no longer has and keeps rows not yet sent', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    const [gone] = a.s().addItems(section, ['Gone', 'Stays']);
    await a.settle();

    remote.rows.items.delete(gone);
    remote.mode = 'transient';
    a.s().addItem(section, 'Unsent');
    await a.settle();

    await a.engine.refetch();
    await a.s().reload();
    expect(texts(a)).toEqual(['Stays', 'Unsent']);
  });

  it('leaves the local copy alone when the server cannot be reached', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'Milk');
    await a.settle();
    remote.offline = true;
    remote.rows.items.clear();
    await a.engine.refetch();
    await a.s().reload();
    expect(texts(a)).toEqual(['Milk']);
  });
});

describe('two devices', () => {
  it('keeps both items when both insert at the same position', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const b = await client(remote, 'b');
    const section = a.s().addSection('Grocery List');
    a.s().addItem(section, 'First');
    await a.settle();
    await b.engine.refetch();
    await b.s().reload();
    expect(texts(b)).toEqual(['First']);

    const fromA = a.s().addItem(section, 'From A');
    const fromB = b.s().addItem(section, 'From B');
    const position = (c: typeof a, id: string) => c.s().items.find((i) => i.id === id)!.position;
    expect(position(a, fromA)).toBe(position(b, fromB));

    await a.settle();
    await b.settle();
    await a.settle();

    expect(texts(a)).toEqual(['First', 'From A', 'From B']);
    expect(texts(b)).toEqual(texts(a));
  });

  it('merges different fields changed on the same item', async () => {
    const remote = new FakeRemote();
    const a = await client(remote, 'a');
    const b = await client(remote, 'b');
    const section = a.s().addSection('Grocery List');
    const item = a.s().addItem(section, 'Mlik');
    await a.settle();
    await b.engine.refetch();
    await b.s().reload();

    a.s().checkItem(item, null);
    b.s().setItemText(item, 'Milk');
    await a.settle();
    await b.settle();
    await a.settle();

    expect(remote.rows.items.get(item)).toMatchObject({ text: 'Milk', checked: true });
    expect(a.s().items[0]).toMatchObject({ text: 'Milk', checked: true });
    expect(b.s().items[0]).toMatchObject({ text: 'Milk', checked: true });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/syncEngine.test.ts`
Expected: FAIL, cannot resolve `./syncEngine`.

- [ ] **Step 4: Write the engine**

`src/sync/syncEngine.ts`:

```ts
import type { Item, Section, StoreOrder } from '../domain/types';
import type { LocalDb, Mutation, TableName } from './localDb';
import type { Outbox } from './outbox';

export type Row = Record<string, unknown>;
export type RemoteResult = { ok: true } | { ok: false; permanent: boolean };
export type Snapshot = { sections: Section[]; items: Item[]; store_orders: StoreOrder[] };

export interface Remote {
  send(m: Mutation): Promise<RemoteResult>;
  fetchAll(listId: string): Promise<Snapshot | null>;
  subscribe(
    listId: string,
    onRow: (table: TableName, row: Row) => void,
    onRejoin: () => void,
  ): () => void;
}

export type SyncHooks = {
  onChange(): void;
  onRejected(): void;
  onStatus?(pending: number): void;
};

const TABLES: TableName[] = ['sections', 'items', 'store_orders'];
const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 60000;

const keyOf = (table: TableName, row: Row): string =>
  String(table === 'store_orders' ? row.store_id : row.id);

const primaryKey = (table: TableName, row: Row): unknown =>
  table === 'store_orders' ? [row.list_id, row.store_id] : row.id;

// The incoming row wins, except for fields with a local change not yet sent.
function merge(local: Row | undefined, incoming: Row, fields: Set<string> | undefined): Row {
  if (!local || !fields) return incoming;
  const merged = { ...incoming };
  for (const field of fields) {
    if (field in local) merged[field] = local[field];
  }
  return merged;
}

export class SyncEngine {
  private busy = false;
  private again = false;
  private stalled = false;
  private rejected = false;
  private stopped = false;
  private retryMs = FIRST_RETRY_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private db: LocalDb,
    private outbox: Outbox,
    private remote: Remote,
    private listId: string,
    private hooks: SyncHooks,
  ) {}

  async flush(): Promise<void> {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        await this.drain();
      } while (this.again && !this.stalled);
    } finally {
      this.busy = false;
    }
    this.hooks.onStatus?.(await this.outbox.count());
    if (this.rejected) {
      this.rejected = false;
      this.hooks.onRejected();
      await this.refetch();
    }
    if (this.stalled) this.retryLater();
    else this.retryMs = FIRST_RETRY_MS;
  }

  private async drain(): Promise<void> {
    this.stalled = false;
    for (;;) {
      const mutation = await this.outbox.next();
      if (!mutation) return;
      const result = await this.remote.send(mutation);
      if (!result.ok && !result.permanent) {
        this.outbox.release();
        this.stalled = true;
        return;
      }
      if (!result.ok) this.rejected = true;
      await this.outbox.done(mutation.seq!);
    }
  }

  private retryLater(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  async refetch(): Promise<void> {
    const snapshot = await this.remote.fetchAll(this.listId);
    if (!snapshot) return;
    const { db } = this;
    await db.transaction('rw', [db.sections, db.items, db.store_orders, db.outbox], async () => {
      const pending = await this.outbox.pendingFields();
      for (const table of TABLES) {
        const store = db.table(table);
        const seen = new Set<string>();
        for (const row of snapshot[table] as Row[]) {
          const key = keyOf(table, row);
          seen.add(key);
          const local = (await store.get(primaryKey(table, row))) as Row | undefined;
          await store.put(merge(local, row, pending.get(`${table}:${key}`)));
        }
        for (const local of (await store.toArray()) as Row[]) {
          const key = keyOf(table, local);
          if (!seen.has(key) && !pending.has(`${table}:${key}`)) {
            await store.delete(primaryKey(table, local));
          }
        }
      }
    });
    this.hooks.onChange();
  }

  async applyRemote(table: TableName, row: Row): Promise<void> {
    const { db } = this;
    await db.transaction('rw', [db.sections, db.items, db.store_orders, db.outbox], async () => {
      const store = db.table(table);
      const key = primaryKey(table, row);
      if (table !== 'store_orders' && row.deleted_at) {
        await store.delete(key);
        return;
      }
      const pending = await this.outbox.pendingFields();
      const local = (await store.get(key)) as Row | undefined;
      await store.put(merge(local, row, pending.get(`${table}:${keyOf(table, row)}`)));
    });
    this.hooks.onChange();
  }

  async sync(): Promise<void> {
    await this.flush();
    if (!this.stalled) await this.refetch();
  }

  start(): () => void {
    const unsubscribe = this.remote.subscribe(
      this.listId,
      (table, row) => void this.applyRemote(table, row),
      () => void this.sync(),
    );
    // Realtime does not replay what was missed, so catch up whenever the app
    // comes back online or to the foreground.
    const wake = () => {
      if (document.visibilityState === 'visible') void this.sync();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    void this.sync();
    return () => {
      unsubscribe();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      this.stop();
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sync/syncEngine.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Write the Supabase remote and client**

`.env.example`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=paste-the-anon-key-here
```

Create `.env.local` with the real local values (the file is git-ignored):

```bash
npx supabase status -o env | awk -F= '/^API_URL=/{print "VITE_SUPABASE_URL=" $2} /^ANON_KEY=/{print "VITE_SUPABASE_ANON_KEY=" $2}' | tr -d '"' > .env.local
cat .env.local
```

Expected: two lines, a URL and a long key. If the key line is missing, copy the anon (or publishable) key from `npx supabase status` by hand.

`src/sync/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
```

`src/sync/supabaseRemote.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Item, Section, StoreOrder } from '../domain/types';
import type { Remote, RemoteResult, Row } from './syncEngine';

const RETRY_STATUSES = [401, 408, 429];

function toResult(error: unknown, status: number): RemoteResult {
  if (!error) return { ok: true };
  const permanent = status >= 400 && status < 500 && !RETRY_STATUSES.includes(status);
  return { ok: false, permanent };
}

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async send(m) {
      try {
        if (m.kind === 'patch') {
          const { error, status } = await sb.from(m.table).update(m.values).eq('id', m.id);
          return toResult(error, status);
        }
        if (m.kind === 'insert') {
          const { error, status } = await sb
            .from(m.table)
            .upsert(m.values, { onConflict: 'id', ignoreDuplicates: true });
          return toResult(error, status);
        }
        const { error, status } = await sb
          .from(m.table)
          .upsert(m.values, { onConflict: 'list_id,store_id' });
        return toResult(error, status);
      } catch {
        return { ok: false, permanent: false };
      }
    },

    async fetchAll(listId) {
      try {
        const [sections, items, orders] = await Promise.all([
          sb.from('sections').select('*').eq('list_id', listId).is('deleted_at', null),
          sb.from('items').select('*').eq('list_id', listId).is('deleted_at', null),
          sb.from('store_orders').select('*').eq('list_id', listId),
        ]);
        if (sections.error || items.error || orders.error) return null;
        return {
          sections: sections.data as Section[],
          items: items.data as Item[],
          store_orders: orders.data as StoreOrder[],
        };
      } catch {
        return null;
      }
    },

    subscribe(listId, onRow, onRejoin) {
      const channel = sb.channel(`list:${listId}`);
      for (const table of ['sections', 'items', 'store_orders'] as const) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `list_id=eq.${listId}` },
          (payload) => {
            if (payload.eventType !== 'DELETE') onRow(table, payload.new as Row);
          },
        );
      }
      let joinedBefore = false;
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (joinedBefore) onRejoin();
        joinedBefore = true;
      });
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
```

Run: `npm run typecheck`
Expected: no errors. (`supabaseRemote` is exercised end to end in Task 13's manual check and Task 15's phone pass; its rules are the ones the database tests in Task 11 and the engine tests above pin down.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add sync engine and Supabase remote"
```

---

### Task 13: Sign-in, runtime wiring, settings and sync indicator

**Files:**
- Create: `src/domain/email.ts`, `src/state/syncStatus.ts`, `src/ui/SyncIndicator.tsx`, `src/ui/SignIn.tsx`, `src/ui/SettingsSheet.tsx`, `src/sync/runtime.ts`, `supabase/templates/code.html`
- Modify: `src/App.tsx`, `src/main.tsx`, `supabase/config.toml`
- Test: `src/domain/email.test.ts`, `src/ui/SyncIndicator.test.tsx`, `src/ui/SignIn.test.tsx`, `src/ui/SettingsSheet.test.tsx`, `src/App.test.tsx` (replace)

**Interfaces:**
- Consumes: `supabase`, `supabaseRemote`, `SyncEngine`, `LocalDb`, `Outbox`, `createNoteStore`, `NoteStore`, `NoteStoreProvider`, `NoteView`, `readSetting`, `writeSetting`, database functions `bootstrap` and `list_people`, table `list_invites`, shadcn `sheet`.
- Produces:
  - `normalizeEmail(input: string): string | null` — trimmed, lower-cased, or null if it is not an email address.
  - `useSyncStatus` Zustand hook with state `{ pending: number; online: boolean; notice: string | null }`; `showNotice(text: string): void` shows a notice for 4 seconds.
  - `SyncIndicator()`
  - `type AuthApi = { signInWithOtp(args: { email: string }): Promise<{ error: { message: string } | null }>; verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<{ error: { message: string } | null }> }`; `SignIn(props: { auth: AuthApi })`
  - `type Person = { email: string; pending: boolean }`; `SettingsPanel(props: { loadPeople(): Promise<Person[]>; invite(email: string): Promise<boolean>; onSignOut(): void })`; `SettingsSheet(props)` with the same props, wrapping the panel in a bottom sheet opened by a button named `Settings`.
  - `type Runtime = { store: NoteStore; listId: string; stop(): void; signOut(): Promise<void>; loadPeople(): Promise<Person[]>; invite(email: string): Promise<boolean> }`; `startRuntime(sb: SupabaseClient): Promise<Runtime>`
  - `App(props: { sb: SupabaseClient; start?: (sb: SupabaseClient) => Promise<Runtime> })`

Rules:
- A device that has a cached list id opens the note at once from the local copy, with or without a network or a valid session. The sign-in screen is shown only when there is no cached list, when Supabase reports `SIGNED_OUT`, or when the device is online and has no session.
- Signing out from settings deletes the local copy. An expired session does not.

- [ ] **Step 1: Write the failing tests**

`src/domain/email.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
  });

  it('returns null for anything that is not an address', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('anna')).toBeNull();
    expect(normalizeEmail('anna@')).toBeNull();
    expect(normalizeEmail('anna@example')).toBeNull();
    expect(normalizeEmail('an na@example.com')).toBeNull();
  });
});
```

`src/ui/SyncIndicator.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSyncStatus } from '../state/syncStatus';
import { SyncIndicator } from './SyncIndicator';

beforeEach(() => useSyncStatus.setState({ pending: 0, online: true, notice: null }));

describe('SyncIndicator', () => {
  it('shows nothing when online', () => {
    useSyncStatus.setState({ pending: 3, online: true });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when offline with nothing waiting', () => {
    useSyncStatus.setState({ pending: 0, online: false });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says changes will sync when offline with changes waiting', () => {
    useSyncStatus.setState({ pending: 2, online: false });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline — changes will sync');
  });

  it('shows a notice', () => {
    render(<SyncIndicator />);
    act(() => useSyncStatus.setState({ notice: 'A change could not be saved.' }));
    expect(screen.getByRole('status')).toHaveTextContent('A change could not be saved.');
  });
});
```

`src/ui/SignIn.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignIn, type AuthApi } from './SignIn';

function setup(overrides: Partial<AuthApi> = {}) {
  const auth: AuthApi = {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  render(<SignIn auth={auth} />);
  return { auth, user: userEvent.setup() };
}

describe('SignIn', () => {
  it('rejects an invalid email without calling the server', async () => {
    const { auth, user } = setup();
    await user.type(screen.getByLabelText('Email'), 'anna{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a code and then verifies it', async () => {
    const { auth, user } = setup();
    await user.type(screen.getByLabelText('Email'), ' Anna@Example.com{Enter}');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'anna@example.com' });
    await user.type(await screen.findByLabelText('6-digit code'), '123456{Enter}');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'anna@example.com', token: '123456', type: 'email' });
  });

  it('explains a wrong or expired code', async () => {
    const { user } = setup({ verifyOtp: vi.fn(async () => ({ error: { message: 'Token has expired or is invalid' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    await user.type(await screen.findByLabelText('6-digit code'), '000000{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired.');
  });

  it('explains a rate limit', async () => {
    const { user } = setup({ signInWithOtp: vi.fn(async () => ({ error: { message: 'email rate limit exceeded' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });

  it('explains a failure to send', async () => {
    const { user } = setup({ signInWithOtp: vi.fn(async () => ({ error: { message: 'Failed to fetch' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send the code.');
  });

  it('goes back to the email step', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
```

`src/ui/SettingsSheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPanel, type Person } from './SettingsSheet';

function setup(inviteResult = true) {
  const people: Person[] = [{ email: 'anna@example.com', pending: false }];
  const props = {
    loadPeople: vi.fn(async () => [...people]),
    invite: vi.fn(async (email: string) => {
      if (inviteResult) people.push({ email, pending: true });
      return inviteResult;
    }),
    onSignOut: vi.fn(),
  };
  render(<SettingsPanel {...props} />);
  return { props, user: userEvent.setup() };
}

describe('SettingsPanel', () => {
  it('lists the people on the list', async () => {
    setup();
    expect(await screen.findByText('anna@example.com')).toBeInTheDocument();
  });

  it('invites a normalised email and shows it as pending', async () => {
    const { props, user } = setup();
    await user.type(screen.getByLabelText('Share with'), ' Bo@Example.com{Enter}');
    expect(props.invite).toHaveBeenCalledWith('bo@example.com');
    expect(await screen.findByText('bo@example.com')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByLabelText('Share with')).toHaveValue('');
  });

  it('rejects an invalid email', async () => {
    const { props, user } = setup();
    await user.type(screen.getByLabelText('Share with'), 'bo{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(props.invite).not.toHaveBeenCalled();
  });

  it('explains a failed invite', async () => {
    const { user } = setup(false);
    await user.type(screen.getByLabelText('Share with'), 'bo@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the invite.');
  });

  it('signs out', async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});
```

Replace `src/App.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { writeSetting } from './state/deviceSettings';
import type { Runtime } from './sync/runtime';
import { makeStore } from './test/helpers';

function fakeSupabase(session: unknown): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient;
}

async function fakeStart(): Promise<Runtime> {
  const { store } = await makeStore();
  store.getState().addSection('Grocery List');
  return {
    store,
    listId: 'list-1',
    stop: vi.fn(),
    signOut: vi.fn(async () => {}),
    loadPeople: vi.fn(async () => []),
    invite: vi.fn(async () => true),
  };
}

const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });

beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

describe('App', () => {
  it('shows sign-in on a new device', async () => {
    const start = vi.fn(fakeStart);
    render(<App sb={fakeSupabase(null)} start={start} />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it('shows the note when signed in', async () => {
    render(<App sb={fakeSupabase({ user: { id: 'u1' } })} start={fakeStart} />);
    expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
  });

  it('opens the note offline on a device that has used the app, even with no session', async () => {
    writeSetting('listId', 'list-1');
    setOnline(false);
    render(<App sb={fakeSupabase(null)} start={fakeStart} />);
    expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('asks to sign in again when online with no session', async () => {
    writeSetting('listId', 'list-1');
    render(<App sb={fakeSupabase(null)} start={fakeStart} />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('offers a retry when first-time setup cannot reach the server', async () => {
    const start = vi.fn(async (): Promise<Runtime> => {
      throw new Error('offline');
    });
    render(<App sb={fakeSupabase({ user: { id: 'u1' } })} start={start} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: the five new test files FAIL (modules not found, or `App` does not accept `sb`).

- [ ] **Step 3: Write the small pieces**

`src/domain/email.ts`:

```ts
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
```

`src/state/syncStatus.ts`:

```ts
import { create } from 'zustand';

type SyncStatus = { pending: number; online: boolean; notice: string | null };

export const useSyncStatus = create<SyncStatus>()(() => ({
  pending: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  notice: null,
}));

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export function showNotice(text: string): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  useSyncStatus.setState({ notice: text });
  noticeTimer = setTimeout(() => useSyncStatus.setState({ notice: null }), 4000);
}
```

`src/ui/SyncIndicator.tsx`:

```tsx
import { useSyncStatus } from '../state/syncStatus';

export function SyncIndicator() {
  const pending = useSyncStatus((s) => s.pending);
  const online = useSyncStatus((s) => s.online);
  const notice = useSyncStatus((s) => s.notice);
  const text = notice ?? (!online && pending > 0 ? 'Offline — changes will sync' : null);
  if (!text) return null;
  return (
    <p role="status" className="mr-auto text-[13px] text-ink-2">
      {text}
    </p>
  );
}
```

- [ ] **Step 4: Write `SignIn`**

`src/ui/SignIn.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { normalizeEmail } from '../domain/email';

export type AuthApi = {
  signInWithOtp(args: { email: string }): Promise<{ error: { message: string } | null }>;
  verifyOtp(args: {
    email: string;
    token: string;
    type: 'email';
  }): Promise<{ error: { message: string } | null }>;
};

const FIELD =
  'w-full border-b border-line bg-transparent py-2 text-[16px] caret-notes-ink outline-none placeholder:text-ink-2';
const BUTTON = 'self-start text-[16px] font-semibold text-notes-ink disabled:opacity-50';

function sendError(message: string): string {
  return /rate limit|security purposes/i.test(message)
    ? 'Too many attempts. Wait a minute and try again.'
    : 'Could not send the code. Check your connection and try again.';
}

export function SignIn({ auth }: { auth: AuthApi }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const address = normalizeEmail(email);
    if (!address) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const result = await auth.signInWithOtp({ email: address });
    setBusy(false);
    if (result.error) {
      setError(sendError(result.error.message));
      return;
    }
    setError(null);
    setSentTo(address);
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    const result = await auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (result.error) {
      setError('That code is wrong or has expired. Try again or request a new one.');
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col gap-4 px-6 pt-24">
      <h1 className="text-[20px] font-semibold">storeNotes</h1>
      {sentTo === null ? (
        <form className="flex flex-col gap-4" onSubmit={send} noValidate>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            Email
            <input
              className={FIELD}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" className={BUTTON} disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={verify} noValidate>
          <p className="text-[14px] text-ink-2">We sent a code to {sentTo}.</p>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            6-digit code
            <input
              className={FIELD}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" className={BUTTON} disabled={busy}>
            Sign in
          </button>
          <button
            type="button"
            className="self-start text-[13px] text-ink-2"
            onClick={() => {
              setSentTo(null);
              setCode('');
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-[14px] text-ink">
          {error}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Write the settings sheet**

`src/ui/SettingsSheet.tsx`:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { normalizeEmail } from '../domain/email';

export type Person = { email: string; pending: boolean };

type Props = {
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
  onSignOut(): void;
};

export function SettingsPanel({ loadPeople, invite, onSignOut }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPeople(await loadPeople());
  }, [loadPeople]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = normalizeEmail(email);
    if (!address) {
      setError('Enter a valid email address.');
      return;
    }
    if (!(await invite(address))) {
      setError('Could not save the invite. Check your connection and try again.');
      return;
    }
    setError(null);
    setEmail('');
    await refresh();
  };

  return (
    <div className="flex flex-col gap-5 px-4 pb-8">
      <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Share with
          <input
            className="w-full border-b border-line bg-transparent py-2 text-[16px] text-ink caret-notes-ink outline-none"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <p className="text-[13px] text-ink-2">They see this list when they sign in with that email.</p>
        <button type="submit" className="self-start text-[14px] font-semibold text-notes-ink">
          Invite
        </button>
        {error && (
          <p role="alert" className="text-[14px]">
            {error}
          </p>
        )}
      </form>
      <ul className="flex flex-col gap-1">
        {people.map((person) => (
          <li key={person.email} className="flex justify-between text-[14px]">
            <span>{person.email}</span>
            {person.pending && <span className="text-ink-2">Invited</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="self-start text-[14px] text-notes-ink" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

export function SettingsSheet(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Settings" className="px-1 text-[18px] leading-none text-ink-2">
        ⚙
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="text-[20px] font-semibold">Settings</SheetTitle>
          <SheetDescription className="sr-only">Sharing and account</SheetDescription>
        </SheetHeader>
        {open && <SettingsPanel {...props} />}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Write the runtime**

`src/sync/runtime.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSetting, writeSetting } from '../state/deviceSettings';
import { createNoteStore, type NoteStore } from '../state/noteStore';
import { showNotice, useSyncStatus } from '../state/syncStatus';
import type { Person } from '../ui/SettingsSheet';
import { LocalDb } from './localDb';
import { Outbox } from './outbox';
import { supabaseRemote } from './supabaseRemote';
import { SyncEngine } from './syncEngine';

export type Runtime = {
  store: NoteStore;
  listId: string;
  stop(): void;
  signOut(): Promise<void>;
  loadPeople(): Promise<Person[]>;
  invite(email: string): Promise<boolean>;
};

export async function startRuntime(sb: SupabaseClient): Promise<Runtime> {
  const db = new LocalDb();
  const outbox = new Outbox(db);

  // The list id is cached so later starts need no network.
  let listId = readSetting('listId');
  if (!listId) {
    const { data, error } = await sb.rpc('bootstrap');
    if (error || typeof data !== 'string') throw new Error('Could not set up the list');
    listId = data;
    writeSetting('listId', listId);
  } else {
    const cached = listId;
    // In the background, pick up an invite accepted since the last start.
    void sb.rpc('bootstrap').then(({ data }) => {
      if (typeof data !== 'string' || data === cached) return;
      writeSetting('listId', data);
      void db.delete().then(() => window.location.reload());
    });
  }
  const id = listId;

  const refreshPending = () =>
    void outbox.count().then((pending) => useSyncStatus.setState({ pending }));

  let engine: SyncEngine | null = null;
  const store = createNoteStore({
    db,
    outbox,
    onLocalWrite: () => {
      refreshPending();
      void engine?.flush();
    },
  });
  await store.getState().load(id);

  engine = new SyncEngine(db, outbox, supabaseRemote(sb), id, {
    onChange: () => void store.getState().reload(),
    onRejected: () => showNotice('A change could not be saved.'),
    onStatus: (pending) => useSyncStatus.setState({ pending }),
  });
  const stopEngine = engine.start();

  const setOnline = () => useSyncStatus.setState({ online: navigator.onLine });
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  setOnline();
  refreshPending();

  const stop = () => {
    stopEngine();
    window.removeEventListener('online', setOnline);
    window.removeEventListener('offline', setOnline);
  };

  return {
    store,
    listId: id,
    stop,
    signOut: async () => {
      stop();
      await db.delete();
      writeSetting('listId', null);
      await sb.auth.signOut();
    },
    loadPeople: async () => {
      const { data } = await sb.rpc('list_people', { l: id });
      return (data ?? []) as Person[];
    },
    invite: async (email) => {
      const { error } = await sb
        .from('list_invites')
        .upsert({ list_id: id, email }, { onConflict: 'list_id,email', ignoreDuplicates: true });
      return !error;
    },
  };
}
```

- [ ] **Step 7: Write `App` and update `main.tsx`**

Replace `src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NoteStoreProvider } from './state/context';
import { readSetting } from './state/deviceSettings';
import { startRuntime, type Runtime } from './sync/runtime';
import { NoteView } from './ui/NoteView';
import { SettingsSheet } from './ui/SettingsSheet';
import { SignIn } from './ui/SignIn';
import { SyncIndicator } from './ui/SyncIndicator';

type Start = (sb: SupabaseClient) => Promise<Runtime>;

// undefined = not known yet. A device with a cached list counts as signed in
// from the first render so the note opens with no network.
function useSignedIn(sb: SupabaseClient): boolean | undefined {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(
    readSetting('listId') ? true : undefined,
  );

  useEffect(() => {
    const check = async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) setSignedIn(true);
      else if (!readSetting('listId') || navigator.onLine) setSignedIn(false);
    };
    void check();
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setSignedIn(false);
      else if (session) setSignedIn(true);
    });
    window.addEventListener('online', check);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', check);
    };
  }, [sb]);

  return signedIn;
}

function Note({ sb, start }: { sb: SupabaseClient; start: Start }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let started: Runtime | null = null;
    setFailed(false);
    start(sb).then(
      (rt) => {
        if (cancelled) rt.stop();
        else {
          started = rt;
          setRuntime(rt);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      started?.stop();
    };
  }, [sb, start, attempt]);

  if (failed) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-3 px-6 pt-24">
        <p className="text-[14px] text-ink-2">Connect to the internet to finish setting up.</p>
        <button
          type="button"
          className="self-start text-[16px] font-semibold text-notes-ink"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </button>
      </main>
    );
  }
  if (!runtime) return null;

  return (
    <NoteStoreProvider value={runtime.store}>
      <NoteView
        header={
          <>
            <SyncIndicator />
            <SettingsSheet
              loadPeople={runtime.loadPeople}
              invite={runtime.invite}
              onSignOut={() => void runtime.signOut()}
            />
          </>
        }
      />
    </NoteStoreProvider>
  );
}

export function App({ sb, start = startRuntime }: { sb: SupabaseClient; start?: Start }) {
  const signedIn = useSignedIn(sb);
  if (signedIn === undefined) return null;
  if (!signedIn) {
    return (
      <SignIn
        auth={{
          signInWithOtp: (args) => sb.auth.signInWithOtp(args),
          verifyOtp: (args) => sb.auth.verifyOtp(args),
        }}
      />
    );
  }
  return <Note sb={sb} start={start} />;
}
```

In `src/main.tsx`, import the client and pass it in:

```tsx
import { supabase } from './sync/supabaseClient';
```

```tsx
    <App sb={supabase} />
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 9: Make local sign-in emails show the code**

`supabase/templates/code.html`:

```html
<p>Your storeNotes sign-in code is:</p>
<h2>{{ .Token }}</h2>
<p>It expires in one hour. If you did not ask for it, ignore this email.</p>
```

Append to `supabase/config.toml`:

```toml
[auth.email.template.magic_link]
subject = "Your storeNotes code"
content_path = "./supabase/templates/code.html"

[auth.email.template.confirmation]
subject = "Your storeNotes code"
content_path = "./supabase/templates/code.html"
```

In the existing `[auth.email]` section of `supabase/config.toml`, make sure `otp_length = 6` (add the line if it is missing).

```bash
npx supabase stop && npx supabase start
```

- [ ] **Step 10: Check it end to end against local Supabase**

Run: `npm run dev`. Open the app in two separate browser profiles (or one normal and one private window).

1. Window 1: sign in as `one@example.test`. The code is in the local mail inbox, whose URL `npx supabase status` prints (Mailpit/Inbucket). Expected: the note opens with a `Grocery List` section.
2. Window 1: open Settings, share with `two@example.test`. Expected: it appears as Invited.
3. Window 2: sign in as `two@example.test`. Expected: the same note.
4. Add, edit, check and uncheck items in each window. Expected: the other window follows within about a second and the line being typed in never jumps or loses focus.
5. In window 1's dev tools set the network to Offline, add two items, check one. Expected: all take effect at once and `Offline — changes will sync` shows. Set it back to Online. Expected: the indicator goes and window 2 gets the changes.
6. Reload window 1 while Offline. Expected: the note still opens.

Fix anything that fails before committing.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Add sign-in, runtime wiring, settings and sync indicator"
```

---

### Task 14: Categorisation

**Files:**
- Create: `supabase/functions/categorize/core.ts`, `supabase/functions/categorize/index.ts`, `src/sync/categorizer.ts`
- Modify: `src/sync/runtime.ts`
- Test: `supabase/functions/categorize/core.test.ts`, `src/sync/categorizer.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `isCategory`, `Category`, `NoteStore`, `makeStore`, table `category_cache`.
- Produces:
  - In `core.ts`: `MAX_TEXTS = 50`; `textKey(text: string): string`; `checkRequest(body: unknown, email: string | null | undefined, allowed: string): { ok: true; texts: string[] } | { ok: false; status: number; message: string }`; `type Deps = { getCached(keys: string[]): Promise<Record<string, string>>; putCached(rows: { text_key: string; category: Category }[]): Promise<void>; askModel(texts: string[]): Promise<unknown> }`; `categorize(texts: string[], deps: Deps): Promise<Record<string, Category>>`; `buildPrompt(texts: string[]): { system: string; user: string }`; `RESPONSE_SCHEMA`; `parseModelContent(content: unknown): unknown`.
  - Edge Function `categorize`: `POST { texts: string[] }` → `200 { categories: Record<string, Category> }`, or `401`, `403`, `400`, `502` with `{ error: string }`.
  - `type CategorizeCall = (texts: string[]) => Promise<Record<string, Category>>`; `class Categorizer { constructor(call: CategorizeCall, note: Pick<NoteStore, 'getState'>); run(): Promise<void> }`.

`core.ts` must not use any Deno API, so Vitest can import it. Imports between function files use the `.ts` extension, which Deno requires.

Model contract: the model receives a numbered list of texts and returns `{ "categories": [...] }` with one category per text in the same order. `askModel` returns that parsed object, or anything else if the model misbehaved; `categorize` validates it. If `askModel` throws (network or OpenRouter error), `categorize` throws and the function answers 502, so the client leaves the items untagged and tries again later.

- [ ] **Step 1: Write the failing tests**

`supabase/functions/categorize/core.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from '../_shared/categories.ts';
import {
  buildPrompt,
  categorize,
  checkRequest,
  parseModelContent,
  textKey,
  type Deps,
} from './core.ts';

function makeDeps(cache: Record<string, string> = {}, overrides: Partial<Deps> = {}) {
  const deps = {
    getCached: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in cache).map((k) => [k, cache[k]])),
    ),
    putCached: vi.fn(async (rows: { text_key: string; category: string }[]) => {
      for (const row of rows) cache[row.text_key] = row.category;
    }),
    askModel: vi.fn(async (texts: string[]): Promise<unknown> => ({
      categories: texts.map(() => 'dairy'),
    })),
    ...overrides,
  };
  return deps;
}

describe('textKey', () => {
  it('lower-cases, trims and collapses whitespace', () => {
    expect(textKey('  Mjölk   3% ')).toBe('mjölk 3%');
  });
});

describe('checkRequest', () => {
  const allowed = 'anna@example.com, Bo@Example.com';

  it('accepts an allowed email whatever its case', () => {
    expect(checkRequest({ texts: ['Milk'] }, 'BO@example.com', allowed)).toEqual({ ok: true, texts: ['Milk'] });
  });

  it('refuses an email that is not allowed, or missing', () => {
    expect(checkRequest({ texts: [] }, 'cy@example.com', allowed)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ texts: [] }, null, allowed)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ texts: [] }, 'anna@example.com', '')).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a body without a list of strings', () => {
    expect(checkRequest(null, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
    expect(checkRequest({ texts: 'Milk' }, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
    expect(checkRequest({ texts: ['Milk', 3] }, 'anna@example.com', allowed)).toMatchObject({ ok: false, status: 400 });
  });

  it('accepts 50 texts and refuses 51', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `item ${i}`);
    expect(checkRequest({ texts: fifty }, 'anna@example.com', allowed)).toMatchObject({ ok: true });
    expect(checkRequest({ texts: [...fifty, 'one more'] }, 'anna@example.com', allowed)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('categorize', () => {
  it('answers from the cache without asking the model', async () => {
    const deps = makeDeps({ milk: 'dairy' });
    expect(await categorize(['Milk'], deps)).toEqual({ Milk: 'dairy' });
    expect(deps.askModel).not.toHaveBeenCalled();
    expect(deps.putCached).not.toHaveBeenCalled();
  });

  it('asks the model only for texts not in the cache and caches the answers', async () => {
    const deps = makeDeps(
      { milk: 'dairy' },
      { askModel: vi.fn(async () => ({ categories: ['produce'] })) },
    );
    expect(await categorize(['Milk', 'Äpple'], deps)).toEqual({ Milk: 'dairy', Äpple: 'produce' });
    expect(deps.askModel).toHaveBeenCalledWith(['äpple']);
    expect(deps.putCached).toHaveBeenCalledWith([{ text_key: 'äpple', category: 'produce' }]);
  });

  it('asks once for texts that differ only in case or spacing', async () => {
    const deps = makeDeps();
    expect(await categorize(['milk', 'MILK ', 'Milk'], deps)).toEqual({
      milk: 'dairy',
      'MILK ': 'dairy',
      Milk: 'dairy',
    });
    expect(deps.askModel).toHaveBeenCalledWith(['milk']);
  });

  it('uses other for an unknown category and does not cache it', async () => {
    const deps = makeDeps({}, { askModel: vi.fn(async () => ({ categories: ['dairy', 'sweets'] })) });
    expect(await categorize(['Milk', 'Godis'], deps)).toEqual({ Milk: 'dairy', Godis: 'other' });
    expect(deps.putCached).toHaveBeenCalledWith([{ text_key: 'milk', category: 'dairy' }]);
  });

  it('uses other for everything when the reply has the wrong length', async () => {
    const deps = makeDeps({}, { askModel: vi.fn(async () => ({ categories: ['dairy'] })) });
    expect(await categorize(['Milk', 'Eggs'], deps)).toEqual({ Milk: 'other', Eggs: 'other' });
    expect(deps.putCached).not.toHaveBeenCalled();
  });

  it('uses other when the reply is not the expected object', async () => {
    for (const reply of [null, 'dairy', { categories: 'dairy' }, { items: ['dairy'] }]) {
      const deps = makeDeps({}, { askModel: vi.fn(async () => reply) });
      expect(await categorize(['Milk'], deps)).toEqual({ Milk: 'other' });
      expect(deps.putCached).not.toHaveBeenCalled();
    }
  });

  it('fails when the model cannot be reached', async () => {
    const deps = makeDeps({}, {
      askModel: vi.fn(async () => {
        throw new Error('OpenRouter 503');
      }),
    });
    await expect(categorize(['Milk'], deps)).rejects.toThrow('OpenRouter 503');
  });

  it('returns other for blank text without asking', async () => {
    const deps = makeDeps();
    expect(await categorize(['   '], deps)).toEqual({ '   ': 'other' });
    expect(deps.askModel).not.toHaveBeenCalled();
  });
});

describe('parseModelContent', () => {
  it('parses plain JSON', () => {
    expect(parseModelContent('{"categories":["dairy"]}')).toEqual({ categories: ['dairy'] });
  });

  it('parses JSON wrapped in a code fence', () => {
    expect(parseModelContent('```json\n{"categories":["dairy"]}\n```')).toEqual({ categories: ['dairy'] });
  });

  it('returns null for anything else', () => {
    expect(parseModelContent('Sure! Here you go')).toBeNull();
    expect(parseModelContent(undefined)).toBeNull();
    expect(parseModelContent({ categories: [] })).toBeNull();
  });
});

describe('buildPrompt', () => {
  it('names every category and numbers the items', () => {
    const { system, user } = buildPrompt(['mjölk', 'äpple']);
    for (const category of CATEGORIES) expect(system).toContain(category);
    expect(system).toContain('Swedish');
    expect(user).toBe('1. mjölk\n2. äpple');
  });
});
```

`src/sync/categorizer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../domain/categories';
import { makeStore } from '../test/helpers';
import { Categorizer, type CategorizeCall } from './categorizer';

async function setup(call: CategorizeCall) {
  const { store } = await makeStore();
  const s = () => store.getState();
  const grocery = s().addSection('Grocery List');
  s().setStoreSort(grocery, true);
  const gifts = s().addSection('Gifts');
  const spy = vi.fn(call);
  return { s, grocery, gifts, spy, categorizer: new Categorizer(spy, store) };
}

const allDairy: CategorizeCall = async (texts) =>
  Object.fromEntries(texts.map((t): [string, Category] => [t, 'dairy']));

const category = (s: () => { items: { text: string; category: Category | null }[] }, text: string) =>
  s().items.find((i) => i.text === text)?.category;

describe('Categorizer', () => {
  it('tags untagged items in sections with store sort', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, ['Milk', 'Yoghurt']);
    await categorizer.run();
    expect(spy).toHaveBeenCalledWith(['Milk', 'Yoghurt']);
    expect(category(s, 'Milk')).toBe('dairy');
    expect(category(s, 'Yoghurt')).toBe('dairy');
  });

  it('never sends items from other sections, blank lines or tagged items', async () => {
    const { s, grocery, gifts, spy, categorizer } = await setup(allDairy);
    s().addItem(gifts, 'Lego for Elsa');
    s().addItem(grocery, '');
    const tagged = s().addItem(grocery, 'Bread');
    s().setCategory(tagged, 'bakery', 'Bread');
    await categorizer.run();
    expect(spy).not.toHaveBeenCalled();
    expect(category(s, 'Lego for Elsa')).toBeNull();
  });

  it('sends a repeated text once and tags every item with it', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, ['Milk', 'Milk']);
    await categorizer.run();
    expect(spy).toHaveBeenCalledWith(['Milk']);
    expect(s().items.map((i) => i.category)).toEqual(['dairy', 'dairy']);
  });

  it('discards a result for text that changed while waiting', async () => {
    let finish!: (result: Record<string, Category>) => void;
    const { s, grocery, categorizer } = await setup(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const item = s().addItem(grocery, 'Milk');
    const running = categorizer.run();
    s().setItemText(item, 'Soap');
    finish({ Milk: 'dairy' });
    await running;
    expect(category(s, 'Soap')).toBeNull();
  });

  it('leaves items untagged on failure and tries again next time', async () => {
    let fail = true;
    const { s, grocery, spy, categorizer } = await setup(async (texts) => {
      if (fail) throw new Error('offline');
      return allDairy(texts);
    });
    s().addItem(grocery, 'Milk');
    await categorizer.run();
    expect(category(s, 'Milk')).toBeNull();
    fail = false;
    await categorizer.run();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(category(s, 'Milk')).toBe('dairy');
  });

  it('sends at most 50 texts per call', async () => {
    const { s, grocery, spy, categorizer } = await setup(allDairy);
    s().addItems(grocery, Array.from({ length: 60 }, (_, i) => `Item ${i}`));
    await categorizer.run();
    expect(spy.mock.calls[0][0]).toHaveLength(50);
    expect(s().items.filter((i) => i.category === null)).toHaveLength(10);
    await categorizer.run();
    expect(s().items.filter((i) => i.category === null)).toHaveLength(0);
  });

  it('ignores values that are not categories', async () => {
    const { s, grocery, categorizer } = await setup(
      async () => ({ Milk: 'sweets' }) as unknown as Record<string, Category>,
    );
    s().addItem(grocery, 'Milk');
    await categorizer.run();
    expect(category(s, 'Milk')).toBeNull();
  });

  it('does not start a second run while one is in progress', async () => {
    let finish!: (result: Record<string, Category>) => void;
    const { s, grocery, spy, categorizer } = await setup(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    s().addItem(grocery, 'Milk');
    const first = categorizer.run();
    await categorizer.run();
    expect(spy).toHaveBeenCalledTimes(1);
    finish({ Milk: 'dairy' });
    await first;
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/categorize/core.test.ts src/sync/categorizer.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the function core**

```bash
npx supabase functions new categorize
```

Expected: `supabase/functions/categorize/index.ts` exists (it is replaced in Step 4).

`supabase/functions/categorize/core.ts`:

```ts
import { CATEGORIES, isCategory, type Category } from '../_shared/categories.ts';

export const MAX_TEXTS = 50;

export function textKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export type Check =
  | { ok: true; texts: string[] }
  | { ok: false; status: number; message: string };

export function checkRequest(
  body: unknown,
  email: string | null | undefined,
  allowed: string,
): Check {
  const allowList = allowed
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  if (!email || !allowList.includes(email.toLowerCase())) {
    return { ok: false, status: 403, message: 'This account cannot use categorisation' };
  }
  const texts = (body as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string')) {
    return { ok: false, status: 400, message: 'texts must be a list of strings' };
  }
  if (texts.length > MAX_TEXTS) {
    return { ok: false, status: 400, message: `At most ${MAX_TEXTS} texts per request` };
  }
  return { ok: true, texts: texts as string[] };
}

export type Deps = {
  getCached(keys: string[]): Promise<Record<string, string>>;
  putCached(rows: { text_key: string; category: Category }[]): Promise<void>;
  askModel(texts: string[]): Promise<unknown>;
};

export async function categorize(
  texts: string[],
  deps: Deps,
): Promise<Record<string, Category>> {
  const keys = [...new Set(texts.map(textKey).filter((key) => key !== ''))];
  const known = new Map<string, Category>();

  if (keys.length > 0) {
    const cached = await deps.getCached(keys);
    for (const key of keys) {
      const category = cached[key];
      if (isCategory(category)) known.set(key, category);
    }
  }

  const misses = keys.filter((key) => !known.has(key));
  if (misses.length > 0) {
    const reply = await deps.askModel(misses);
    const list = (reply as { categories?: unknown } | null)?.categories;
    const fresh: { text_key: string; category: Category }[] = [];
    // Answers are matched to texts by position, so a reply of the wrong
    // length cannot be trusted at all.
    if (Array.isArray(list) && list.length === misses.length) {
      misses.forEach((key, index) => {
        const category = list[index];
        if (isCategory(category)) {
          known.set(key, category);
          fresh.push({ text_key: key, category });
        }
      });
    }
    if (fresh.length > 0) await deps.putCached(fresh);
  }

  const result: Record<string, Category> = {};
  for (const text of texts) result[text] = known.get(textKey(text)) ?? 'other';
  return result;
}

export function buildPrompt(texts: string[]): { system: string; user: string } {
  const system = [
    'You sort shopping-list items into supermarket categories.',
    'Items may be written in Swedish or English.',
    `Allowed categories: ${CATEGORIES.join(', ')}.`,
    'Use "other" for anything that is not a grocery or household product.',
    'Reply with JSON only, in the form {"categories": ["...", "..."]}:',
    'exactly one category per item, in the same order as the items.',
  ].join('\n');
  const user = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
  return { system, user };
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
  },
  required: ['categories'],
  additionalProperties: false,
};

export function parseModelContent(content: unknown): unknown {
  if (typeof content !== 'string') return null;
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write the function entry point**

Replace `supabase/functions/categorize/index.ts` with:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPrompt,
  categorize,
  checkRequest,
  parseModelContent,
  RESPONSE_SCHEMA,
} from './core.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function askOpenRouter(texts: string[]): Promise<unknown> {
  const { system, user } = buildPrompt(texts);
  const call = (withSchema: boolean) =>
    fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(withSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'categories', strict: true, schema: RESPONSE_SCHEMA },
              },
            }
          : {}),
      }),
    });

  // Not every model route accepts a response schema. The reply is validated
  // in core.ts either way, so fall back to asking without one.
  let response = await call(true);
  if (response.status === 400 || response.status === 404) response = await call(false);
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const data = await response.json();
  return parseModelContent(data?.choices?.[0]?.message?.content);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!userData?.user) return json({ error: 'Not signed in' }, 401);

  const body = await req.json().catch(() => null);
  const check = checkRequest(body, userData.user.email, Deno.env.get('ALLOWED_EMAILS') ?? '');
  if (!check.ok) return json({ error: check.message }, check.status);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const categories = await categorize(check.texts, {
      async getCached(keys) {
        const { data, error } = await admin
          .from('category_cache')
          .select('text_key, category')
          .in('text_key', keys);
        if (error) throw error;
        return Object.fromEntries((data ?? []).map((row) => [row.text_key, row.category]));
      },
      async putCached(rows) {
        await admin.from('category_cache').upsert(rows, { onConflict: 'text_key' });
      },
      askModel: askOpenRouter,
    });
    return json({ categories });
  } catch (error) {
    console.error(error);
    return json({ error: 'Categorisation failed' }, 502);
  }
});
```

- [ ] **Step 5: Write the client categoriser**

`src/sync/categorizer.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/categorize/core.test.ts src/sync/categorizer.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Wire the categoriser into the runtime**

In `src/sync/runtime.ts`, add the imports:

```ts
import type { Category } from '../domain/categories';
import { Categorizer } from './categorizer';
```

Replace the block from `let engine: SyncEngine | null = null;` through `const stopEngine = engine.start();` with:

```ts
  let engine: SyncEngine | null = null;
  let categorizer: Categorizer | null = null;

  const store = createNoteStore({
    db,
    outbox,
    onLocalWrite: () => {
      refreshPending();
      // Send the change first so the item exists remotely, then tag it.
      void engine?.flush().then(() => categorizer?.run());
    },
  });
  await store.getState().load(id);

  categorizer = new Categorizer(async (texts) => {
    const { data, error } = await sb.functions.invoke('categorize', { body: { texts } });
    if (error) throw error;
    return (data as { categories: Record<string, Category> }).categories;
  }, store);

  engine = new SyncEngine(db, outbox, supabaseRemote(sb), id, {
    // Changes from the other device can include untagged items.
    onChange: () => void store.getState().reload().then(() => categorizer?.run()),
    onRejected: () => showNotice('A change could not be saved.'),
    onStatus: (pending) => useSyncStatus.setState({ pending }),
  });
  const stopEngine = engine.start();
```

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add item categorisation through OpenRouter"
```

---

### Task 15: Real stores, installable app, deploy and phone pass

**Files:**
- Create: `public/icon.svg`, generated icons in `public/`
- Modify: `src/domain/stores.ts`, `vite.config.ts`, `index.html`

**Interfaces:**
- Consumes: everything.
- Produces: the deployed, installable app.

Steps marked **(Wictor)** need his accounts or his phone. Ask him and wait; do not guess values.

- [ ] **Step 1: Replace the example stores (Wictor)**

Ask Wictor for, per store: the name, and the layout in his own words from entrance to checkout.

Rewrite `STORES` in `src/domain/stores.ts`. For each store: a stable lower-case `id` (for example `ica-maxi`), the `name` as it should appear in the picker, his layout text as a comment above the entry, and a `baseline` listing all 24 categories in walking order. Categories his text does not mention go where they most plausibly sit, with `other` last. Remove the "Example layouts" comment.

Run: `npm test`
Expected: all pass. `src/domain/stores.test.ts` fails if a category is missing or repeated.

Show Wictor the two baselines as ordered lists and apply his corrections.

- [ ] **Step 2: Add the icon and the PWA plugin**

`public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ffcc00"/>
  <path d="M148 268l72 72 144-168" fill="none" stroke="#ffffff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

```bash
npx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg
ls public
```

Expected in `public/`: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`.

In `vite.config.ts`, add the import and the plugin:

```ts
import { VitePWA } from 'vite-plugin-pwa';
```

```ts
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'storeNotes',
        short_name: 'storeNotes',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
```

In `index.html`, add inside `<head>`:

```html
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

- [ ] **Step 3: Verify the build**

```bash
npm test && npm run typecheck && npm run build
ls dist/sw.js dist/manifest.webmanifest
```

Expected: tests and types pass; both files exist.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add real stores and make the app installable"
```

- [ ] **Step 5: Create and configure the Supabase project (Wictor)**

1. Wictor creates a project at supabase.com and gives the project ref, the project URL and the anon (publishable) key.
2. Push the schema and deploy the function:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy categorize
```

3. In the dashboard, Authentication → Sign In / Providers → Email: enabled, "Confirm email" on, "Email OTP length" 6.
4. In the dashboard, Authentication → Emails: set both the "Magic Link" and the "Confirm signup" template body to the contents of `supabase/templates/code.html`, subject "Your storeNotes code". A first-time user gets the confirm-signup email, a returning one the magic-link email; both must show `{{ .Token }}`.

- [ ] **Step 6: Set the function secrets (Wictor)**

Find the current Haiku model id on OpenRouter:

```bash
curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"anthropic/claude[^"]*haiku[^"]*"' | sort -u
```

Expected: a short list of ids. Use the newest Claude Haiku (expected `anthropic/claude-haiku-5.5`).

Wictor provides his OpenRouter API key and the two email addresses:

```bash
npx supabase secrets set OPENROUTER_API_KEY=<key> OPENROUTER_MODEL=<model-id> ALLOWED_EMAILS=<email-1>,<email-2>
```

- [ ] **Step 7: Deploy the web app (Wictor)**

```bash
npx vercel link
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel --prod
```

Enter the project URL and anon key when asked. Expected: a production URL.

In the Supabase dashboard, Authentication → URL Configuration: set Site URL to the production URL.

- [ ] **Step 8: Check categorisation on the deployed app**

Open the production URL in a desktop browser, sign in with one of the allowed emails, choose a store, and add `mjölk`, `äpplen` and `glass` with the quick-add bar.

Expected: each appears at the top of the grocery section and, within a few seconds, moves to its place in the store order (produce, dairy, frozen).

If items stay at the top, read the function log and fix the cause before continuing:

```bash
npx supabase functions logs categorize
```

- [ ] **Step 9: Phone pass (Wictor)**

On both iPhones: open the production URL in Safari, Share → Add to Home Screen, open from the home screen.

- [ ] Sign in with the emailed code on phone 1; invite the second email; sign in on phone 2; both show the same note.
- [ ] Quick add: type, Return, type, Return. The keyboard stays up and the bar stays directly above it.
- [ ] Paste three lines into quick add; three items are added.
- [ ] Edit a line; Return makes a new line below; Backspace on an empty line removes it.
- [ ] With both phones open, add, edit, check and uncheck on each. The other follows within about a second and the line being typed in never moves or loses focus.
- [ ] Choose a store on phone 1. The grocery section reorders; phone 2 is unchanged.
- [ ] Check items; they sink to Done. Tap a Done item; it returns. `Clear done` removes them.
- [ ] Long-press and drag reorders with `No store` chosen; it does nothing with a store chosen.
- [ ] Add a `Christmas Gifts` section; it has no store picker; quick add can target it via the chip.
- [ ] Airplane mode on phone 1: close and reopen the app; the note is there. Add and check items; `Offline — changes will sync` shows. Turn airplane mode off; the indicator goes and phone 2 gets the changes.
- [ ] Text sizes look right, nothing zooms when a field is focused, dark mode follows the phone.
- [ ] With Reduce Motion on (Settings → Accessibility → Motion), items change place without animation.

Fix what fails, redeploy with `npx vercel --prod`, and repeat the failed checks.

