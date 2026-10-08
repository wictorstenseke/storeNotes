# storeNotes — design

Date: 2026-10-08
Status: awaiting review

## Purpose

A shared checklist note for two people (Wictor and his wife) that replaces their shared Apple Notes grocery list. It must be faster to add to than Apple Notes, feel instant while editing, sync live between both phones, and sort the grocery section into walking order for the store being visited.

Success looks like:

- Adding an item takes one tap plus typing plus Enter, and the field is ready for the next item.
- Every edit shows on screen immediately; the network is never waited on.
- The other person's edits appear within about a second when both are online.
- Picking a store reorders the grocery section into that store's walking order.
- The list opens and is fully usable with no signal.

## Scope

In v1:

- One shared note with many sections.
- Line-based checklist editing with document-like keyboard behaviour.
- Quick-add bar.
- Two stores defined in code, per-device store picker, sorted view.
- AI categorisation of items.
- Learning of store order from check-off order.
- Accounts, sharing with one other email, live sync, offline cache and queued edits.
- Installable PWA, used mainly on iPhone.

Not in v1:

- Multiple notes.
- Adding or editing stores in the app.
- Manually correcting an item's category.
- Quantities, prices, notifications, item history or suggestions.
- Plain-text (non-checkbox) lines.
- Purging soft-deleted rows.

Assumptions:

- UI text is in English; item text can be any language (Swedish expected).
- Two users, so last-write-wins conflict handling is acceptable.

## Behaviour

### Note and sections

- The note is a vertical list of sections. Each section has an editable title and a list of items.
- `+ New section` at the bottom of the note adds a section and focuses its title.
- Each section has a "store sort" setting. It is on for the default `Grocery List` section and off for new sections. It can be changed from the section's menu, which also holds `Delete section`.
- Deleting a section asks for confirmation and deletes its items.

### Items

- An item is one line: a checkbox and text.
- Tap the text to edit in place.
- Enter on a line commits it and creates a new empty line directly below, focused.
- Backspace on an empty line deletes it and moves focus to the end of the line above.
- Arrow up/down moves between lines when a hardware keyboard is used.
- An empty line that loses focus is deleted.
- Long-press and drag reorders items within a section. Dragging is available only in the manual view ("No store"), not in a sorted view.
- An item never changes position while it is focused. Any re-sort caused by its category arriving or changing is applied when it loses focus.

### Quick add

- An input bar is pinned to the bottom of the screen and stays above the on-screen keyboard.
- Type and press Enter (or tap `+`): the item is added, the field clears and stays focused.
- A chip in the bar shows the target section. It defaults to the section last added to on this device, and tapping it switches section.
- Text containing commas or line breaks adds one item per part. Empty parts are ignored.
- Quick-added items go to the end of the target section's manual order.

### Stores and sorted view

- Stores are defined in `src/domain/stores.ts`. Each has an id, a name, the layout description as written by Wictor (kept as a comment for reference), and a baseline category order: the full category list in walking order.
- Wictor supplies the layout text for the two stores; the baseline order is written from it during implementation. Until then two example stores are used so the feature can be built and tested.
- Sections with store sort on show a store picker: the two stores plus `No store`.
- The selected store is stored per device, not synced. One person can view store order while the other sees manual order.
- With `No store`, unchecked items are in manual order.
- With a store selected, unchecked items are ordered by:
  1. untagged items first (category not yet known),
  2. then the category's rank in the store's effective order,
  3. then manual position,
  4. then item id.
- Selecting a store never changes the stored manual order.
- A new line created with Enter in a sorted view is displayed directly below the line it was created from while it is focused. This placement is display-only and not stored. When the line loses focus it follows the normal rules: untagged at the top until its category arrives, then in its category's place.

### Checking off

- Checking an item moves it to a dimmed `Done` group at the bottom of its section. Done items are ordered most recently checked first.
- Tapping a Done item unchecks it and returns it to its place in the list.
- `Clear done` at the foot of the Done group deletes all Done items in that section.

### Learning

- When an item is checked, the store selected on that device at that moment is recorded on the item.
- On `Clear done`, before the items are deleted, the Done items that have a store and a category form a trip for that store. If a section's Done items cover more than one store, each store is handled separately.
- A trip is used only if it has at least three distinct categories.
- For each category in the trip, its trip rank is the mean check-off index of its items, scaled to 0–1 (first checked = 0, last = 1).
- Each store keeps a score per category. The starting score is the category's position in the baseline order, scaled to 0–1. After a trip: `score = 0.7 × old score + 0.3 × trip rank`. Categories not in the trip keep their score.
- The effective order for a store is the categories sorted by score, ties broken by baseline order.
- Learning uses plain arithmetic, not AI.

## Visual design

The app should resemble Apple Notes and feel clean, simple, quick and snappy.

Look:

- System font (`-apple-system`, so San Francisco on iPhone). No web fonts.
- Small, calm type. Item text is 16px, which is the smallest size iOS allows in an input without zooming the page on focus. Section titles are 20px semibold. Secondary text (Done items, hints, the offline indicator) is 13–14px. Nothing is larger than the section titles.
- Line rows are compact, about 36px tall, with the whole row tappable so the touch target stays comfortable.
- Plain page background with no cards, boxes or shadows around sections. Sections are separated by white space only.
- Round checkboxes like Apple Notes: a thin grey circle when unchecked, filled with the accent colour and a checkmark when checked.
- Done items have grey text and no strikethrough, as in Apple Notes.
- One accent colour, the Apple Notes yellow, used for checked boxes, the text cursor, the `+` button and links. Everything else is black, white and greys.
- Light and dark mode follow the phone's setting.
- Controls are quiet: the store picker, section chip and section menu are small text or icon buttons, not prominent buttons.
- shadcn components are used only for the settings sheet, menus and the confirmation dialog, and are restyled to match.

Feel:

- No spinners, skeletons or loading screens in the note. The list is on screen at first paint from the local copy.
- Every tap and keystroke takes effect in the same frame; nothing waits for the network.
- Motion is short and functional: about 150–200ms for an item moving to or from the Done group and for a re-sort when the store changes. No decorative animation.
- Motion is turned off when the phone's Reduce Motion setting is on.
- Changes arriving from the other person slide into place with the same short motion and never move the line being edited or steal focus.

## Categories

A fixed list, shared by AI tagging and store orders:

`produce`, `bakery`, `dairy`, `cheese`, `eggs`, `meat`, `fish`, `deli`, `frozen`, `pantry`, `pasta_rice`, `canned`, `baking`, `spices_sauces`, `breakfast`, `snacks`, `candy`, `beverages`, `coffee_tea`, `household`, `personal_care`, `baby`, `pet`, `other`.

Every store's baseline order lists all of them.

## Architecture

### Stack

- React, TypeScript, Vite.
- Tailwind and shadcn for UI.
- `vite-plugin-pwa` for the manifest and app-shell precache.
- Zustand for in-memory state.
- Dexie (IndexedDB) for the local copy and outbox.
- `fractional-indexing` for item and section positions.
- Supabase: Auth, Postgres with row-level security, Realtime, one Edge Function.
- OpenRouter for categorisation, using Claude Haiku 5.5 by default.
- Static hosting on Vercel.

### Units

Pure domain logic, no I/O (`src/domain/`):

| File | Responsibility |
|---|---|
| `categories.ts` | The category list and type |
| `stores.ts` | The two stores and their baseline orders |
| `sort.ts` | Given items, a store's effective order and the focused item id, return display order for unchecked and Done items |
| `learning.ts` | Given Done items and current scores, return new scores; given scores and baseline, return effective order |
| `position.ts` | Generate a position between two neighbours, or at the end |
| `parseQuickAdd.ts` | Split quick-add text into item texts |

Sync (`src/sync/`):

| File | Responsibility |
|---|---|
| `localDb.ts` | Dexie schema: sections, items, store orders, outbox, device settings |
| `outbox.ts` | Append, coalesce and read pending mutations |
| `syncEngine.ts` | Flush the outbox, refetch, subscribe to Realtime, merge incoming rows |
| `categorizer.ts` | Find items needing a category, call the Edge Function, write results |

State (`src/state/`):

- `noteStore.ts`: the Zustand store. Exposes the note and the actions (add item, edit text, check, uncheck, move, delete, clear done, add/rename/delete section, set store sort). Each action updates memory, writes to Dexie and appends to the outbox. Nothing in it awaits the network.

UI (`src/ui/`): `NoteView`, `SectionView`, `ItemLine`, `DoneGroup`, `QuickAddBar`, `StorePicker`, `SignIn`, `SettingsSheet`.

Backend (`supabase/`): `migrations/` for schema, policies and functions; `functions/categorize/` for the Edge Function.

### Data model

All ids are UUIDs generated on the client. `updated_at` is set by a database trigger on every write.

| Table | Columns |
|---|---|
| `lists` | `id`, `name`, `created_by`, `created_at` |
| `list_members` | `list_id`, `user_id` (primary key is the pair) |
| `list_invites` | `list_id`, `email` (primary key is the pair) |
| `sections` | `id`, `list_id`, `title`, `position`, `store_sort`, `updated_at`, `deleted_at` |
| `items` | `id`, `list_id`, `section_id`, `text`, `position`, `checked`, `checked_at`, `checked_store`, `category`, `updated_at`, `deleted_at` |
| `store_orders` | `list_id`, `store_id`, `scores` (JSON: category → score), `updated_at` (primary key is `list_id` + `store_id`) |
| `category_cache` | `text_key` (primary key), `category`, `created_at` |

Notes:

- `position` is a fractional-index string. Display order is `position`, then `id`.
- `items.list_id` duplicates what `section_id` implies, so access rules and Realtime filters are simple.
- `category` is null until tagged. Changing an item's text sets it back to null.
- `category_cache.text_key` is the item text lower-cased, trimmed, with runs of whitespace collapsed. The cache is shared across all lists and written only by the Edge Function.
- The approved outline had a `checkoff_events` table. It is replaced by `checked_at` and `checked_store` on the item: the Done items already hold everything a trip needs, and unchecking an item removes it from the trip with no extra work.

### Access rules

- A user can read and write `sections`, `items` and `store_orders` rows only for lists they are a member of.
- A user can read `lists` and `list_members` for their own lists, and add or remove `list_invites` for them.
- `category_cache` is not readable or writable by clients.
- `accept_invites()` is a database function callable by a signed-in user. It adds a membership for every invite matching the user's verified email and deletes those invites.

### Auth and sharing

- Sign-in: enter email, receive a 6-digit code by email, enter the code. This is used instead of magic links or Google redirects because both are unreliable inside an installed iPhone web app.
- The session persists on the device.
- After sign-in the app calls `accept_invites()`, then loads the user's list. If the user has no list, one is created with a `Grocery List` section (store sort on).
- Settings sheet: `Share with` (enter an email to invite), a list of members and pending invites, and `Sign out`.
- The Supabase project's `ALLOWED_EMAILS` secret lists the two email addresses allowed to use the categorise function, so a stranger who signs up cannot spend API credit.

### Sync and offline

Instant feel:

- The UI renders from the in-memory store, which is loaded from Dexie at start-up. First paint does not need the network.
- Every action updates memory and Dexie synchronously from the user's point of view, then queues a mutation.

Outbox:

- A mutation is an insert (the whole row) or a patch (row id plus only the changed fields).
- Pending patches to the same row are merged before sending.
- The outbox is flushed in order whenever the app is online. A failed send stays queued and is retried with backoff, and on reconnect or when the app returns to the foreground.
- Inserts are sent as upserts, so a retry after a lost response is harmless.

Conflicts:

- Patches carry only changed fields, so two people changing different fields of the same item both succeed (one checks it, the other fixes a typo).
- When both change the same field, the write that reaches the server last wins.
- Two people inserting at the same place may generate the same `position`. Both items are kept, ordered by id, so they appear as adjacent lines.
- Deletes are soft (`deleted_at` set). A patch arriving for a deleted row does not undelete it.

Incoming changes:

- The app subscribes to Realtime changes on `sections`, `items` and `store_orders` for its list.
- An incoming row replaces the local row, except for fields that have a pending local patch, which keep their local value.
- A row arriving with `deleted_at` set is removed locally.
- Realtime does not replay missed events. On reconnect and on returning to the foreground, the app flushes the outbox and then refetches the whole list (rows with `deleted_at` null) and replaces the local copy, again keeping pending local fields. The list is small enough for this to be cheap.

Offline limits:

- Sorting works offline because it uses stored categories and scores.
- Categorising new items and signing in need a connection.

### Categorisation

Edge Function `categorize`:

- Request: `{ texts: string[] }`, at most 50 texts. Requires a signed-in user whose email is in `ALLOWED_EMAILS`.
- For each text it computes `text_key` and looks it up in `category_cache`.
- Texts not in the cache are sent in one call to OpenRouter's chat completions endpoint (`https://openrouter.ai/api/v1/chat/completions`), with the category list and an instruction to return exactly one category per text. The prompt states that items may be in Swedish or English.
- The request asks for JSON output matching a schema. The function does not rely on that: it validates the reply itself, and any text with a missing or unknown category is returned as `other` and not cached, so it is tried again next time.
- New valid results are written to `category_cache`.
- Response: `{ categories: Record<string, Category> }`, keyed by the original text.
- Two Supabase secrets, neither of which reaches the client:
  - `OPENROUTER_API_KEY`: Wictor's OpenRouter key.
  - `OPENROUTER_MODEL`: the OpenRouter model id. It defaults to Claude Haiku 5.5; the exact id is taken from OpenRouter's model list during implementation. Changing the secret switches model with no code change.

Client side (`categorizer.ts`):

- After the outbox flushes, items created or edited on this device with a null category and non-empty text are sent to `categorize` in one batch.
- Each result is written as a patch to the item's `category`, only if the item's text is still the text that was sent.
- On failure the items stay untagged and are retried on the next flush.

### PWA and iPhone details

- Manifest with standalone display, icons and theme colour; the app shell is precached so the app starts offline.
- The quick-add bar follows `visualViewport` so it sits directly above the keyboard.
- Inputs use a 16px font size so iOS does not zoom on focus.

## Error handling

- Offline or failed sync: a small unobtrusive indicator shows "Offline — changes will sync" while the outbox is non-empty and the app is offline. No blocking dialogs.
- A mutation the server rejects permanently (for example, access removed) is dropped from the outbox and the list is refetched; the user sees a brief message that a change could not be saved.
- Categorisation failure: silent; the item stays at the top of the sorted view as untagged and is retried.
- Sign-in errors (wrong or expired code, email rate limit) are shown inline on the sign-in screen.
- Session expired: the app shows the sign-in screen; the local copy and outbox are kept and synced after sign-in.

## Testing

Unit tests (Vitest):

- `sort.ts`: manual order, store order, untagged first, ties, focused item does not move, Done ordering.
- `learning.ts`: trip rank, score update, minimum of three categories, trips for two stores in one section, effective order ties.
- `position.ts`: between, at end, identical neighbours.
- `parseQuickAdd.ts`: commas, line breaks, empty parts.
- `outbox.ts`: patch merging, ordering, retry after failure.
- `syncEngine.ts` against a fake Supabase client: incoming row with pending local fields, soft delete, refetch after reconnect, same-position inserts from two clients both kept.
- `categorizer.ts`: batch selection, stale-text results discarded, retry.

Component tests (React Testing Library):

- `ItemLine` and `SectionView`: Enter, Backspace on empty, blur on empty, check and uncheck.
- `QuickAddBar`: Enter adds and keeps focus, multi-item text, section chip.

Backend tests (local Supabase):

- Access rules: a member can read and write; a non-member cannot; `accept_invites()` grants membership only for a matching email.
- `categorize`, with OpenRouter stubbed: cache hit skips the model call; an unknown category in the reply becomes `other` and is not cached; non-allowed email is refused; more than 50 texts is refused.

Manual pass on iPhone (installed to home screen):

- Sign in with code, invite second account, both see the same note.
- Add, edit, check, uncheck, clear done with both phones open.
- Airplane mode: open, add, check, then reconnect and confirm sync.
- Store picker on one phone does not change the other.
