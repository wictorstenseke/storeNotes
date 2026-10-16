---
name: add-category
description: Use when the owner wants a new shopping category / store section (a shelf, bar or aisle items should sort into), or wants to move items between categories. Covers the code change, deploy and the stale cache and item rows.
---

# Add a category

Categories are code only: `items.category`, `category_cache.category` are plain `text`, `store_orders.scores` free `jsonb`. No migration, ever.

Input from the owner: contents, and where it sits in each store. Missing placement for a store is a `// guess:`; stated placement is `// corrected:`. The id is permanent once written to `items.category`, so confirm it with the owner when they did not give one.

## Steps

1. **Read the neighbours.** `git show 95c7881` is the model commit (texmex). Open `CATEGORY_HINTS` in `supabase/functions/categorize/core.ts` and list every existing category whose hint overlaps the new contents. Done when you have, per overlapping category, the `(not …)` text naming the items that move out of it.

2. **Code, six touch points.**
   - `supabase/functions/_shared/categories.ts`: add to `CATEGORIES`. List position is not store order.
   - `src/domain/categoryLabels.ts`: `{ name, examples }`, Swedish.
   - `src/domain/stores.ts`: insert in **both** `WILLYS` and `ICA`, comment marker per store, and extend the header comment.
   - `core.ts` `CATEGORY_HINTS`: new hint names the shelf and its items, including shelf-mates the owner did not list. Apply the `(not …)` edits from step 1.
   - `src/domain/stores.test.ts`: bump both counts in `has N unique categories`, add an `isCategory` test, add one order assertion per store, and fix any `slice` assertion the insertion shifts. The ICA `described` array is a filter and stays as is. `core.test.ts` is generic over `CATEGORIES`.
   - Run `npm test` and `npm run typecheck`. Done when both are green.

3. **Commit and push to `main`**, only these files. Done when `gh run list --workflow=Deploy --branch main --limit 3` shows your commit as `completed success`.

4. **Deploy the edge function** with the command in CLAUDE.md § Deploy. Push alone leaves the old prompt live. Done when `npx supabase functions list` shows `categorize` one version higher with `verify_jwt: false`.

5. **Purge stale cache rows.** Dump the whole table, it is small:
   ```
   npx supabase db query --linked "select text_key, category from category_cache order by category, text_key"
   ```
   Read every key and pick the ones the new hints would now place in the new category. Judge by meaning: a regex on the owner's example words misses the rest of the shelf. Show the list, ambiguous keys as a question, then `delete … where text_key in (…)`. Never the whole table. Done when no remaining key belongs in the new category, which may mean no delete at all.

6. **Retag live items.** Same judgement on `items` (`deleted_at is null`):
   ```
   npx supabase db query --linked "select id, text, category from items where deleted_at is null order by category, text"
   ```
   Show candidates, then `update items set category = '<new>' where id in (…)`. Rows with `category` null get the new prompt on their next sync. `store_orders.scores` needs nothing: a missing key falls back to the baseline position.

7. **Report**: files changed, deploy run, edge function version, cache keys deleted, items retagged.

Order matters in 4–6: the function must be deployed before the purge, or the old prompt re-caches the old answer.
