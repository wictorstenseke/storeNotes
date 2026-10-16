# storeNotes

Shopping-list PWA. Vite app on GitHub Pages (deploys on every push to `main`), Supabase backend (project ref in `supabase/.temp/project-ref`).

## Categories

Code only, no DB enum or migration. Adding one, or moving items between two, is the `add-category` skill: it covers the six code touch points, both deploys and the stale cache and item rows.

## Deploy

- App: push to `main`, GitHub Pages deploys it. Check with `gh run list --workflow=Deploy --branch main`.
- Edge function (prompt and hint edits only take effect once deployed):
  `npx supabase functions deploy categorize --no-verify-jwt --use-api`
  Keep `--no-verify-jwt`: the function checks auth itself and `config.toml` has no `[functions.categorize]` entry, so a plain deploy would flip `verify_jwt` on. The CLI is logged in and linked.
