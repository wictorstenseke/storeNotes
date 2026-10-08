# storeNotes

Shopping-list PWA. Vite app on GitHub Pages (deploys on every push to `main`), Supabase backend (project ref in `supabase/.temp/project-ref`).

## Adding a category

Categories are code only. No DB enum, check constraint or migration (`items.category`, `category_cache.category` are plain `text`; `store_orders.scores` is free `jsonb`). Don't add a migration.

1. `supabase/functions/_shared/categories.ts`: add to `CATEGORIES`. Position in the list is not the store order. `src/domain/categories.ts` re-exports it.
2. `src/domain/categoryLabels.ts`: add `{ name, examples }` (Swedish UI label).
3. `src/domain/stores.ts`: add to **both** `WILLYS` and `ICA` baselines, at the right spot. Update the header comment. Mark uncertain placements `// guess:`, confirmed ones `// corrected:`.
4. `supabase/functions/categorize/core.ts`: add a `CATEGORY_HINTS` entry. If it takes items from another category, edit that one too (e.g. `snacks: '... (not kex or kakor)'`).
5. Tests: update the count in `src/domain/stores.test.ts` (`toHaveLength(N)` and `Set(...).size`) and add an order assertion.
6. Run `npm test` and `npm run typecheck`.

### Deploy (push to main alone is not enough)

- App: push to `main`, GitHub Pages deploys it. Check with `gh run list --workflow=Deploy --branch main`.
- Edge function (the prompt/hints only take effect once deployed):
  `npx supabase functions deploy categorize --no-verify-jwt --use-api`
  Keep `--no-verify-jwt`: the function checks auth itself and `config.toml` has no `[functions.categorize]` entry, so a plain deploy would flip `verify_jwt` on. The CLI is logged in and linked.

### Stale data after the change

- **Cache:** `public.category_cache` (key = lowercased, trimmed, whitespace-collapsed text) keeps returning the old category. Delete only the affected keys, never the whole table without asking:
  `npx supabase db query --linked "select text_key, category from category_cache where text_key ~* '(pattern)'"`, review, then `delete ... where text_key in (...)`.
- **Items:** existing `items.category` rows keep their old value. Find with a select on `items` (`deleted_at is null`), update if wanted.
- **Store order:** missing keys in `store_orders.scores` fall back to the baseline position (`effectiveOrder` in `src/domain/learning.ts`). No action needed.
