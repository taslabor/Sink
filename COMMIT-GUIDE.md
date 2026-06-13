# Sink Custom Features — Commit Guide (corrected for your repo structure)

All paths below match your actual `taslabor/Sink` layout (Nuxt 4 `app/` layer
structure, shadcn-vue + Tailwind, `#shared` alias, `useAPI` composable).

## Files

### New files

| File in this package | Path in your repo |
|---|---|
| `shared/types/batch.ts` | `shared/types/batch.ts` |
| `server/api/link/bulk.post.ts` | `server/api/link/bulk.post.ts` |
| `server/api/batch/index.get.ts` | `server/api/batch/index.get.ts` |
| `server/api/batch/[id].get.ts` | `server/api/batch/[id].get.ts` |
| `.../app/components/dashboard/links/Table.vue` | `layers/dashboard/app/components/dashboard/links/Table.vue` |
| `.../app/pages/dashboard/bulk-create.vue` | `layers/dashboard/app/pages/dashboard/bulk-create.vue` |
| `.../app/pages/dashboard/batches/index.vue` | `layers/dashboard/app/pages/dashboard/batches/index.vue` |
| `.../app/pages/dashboard/batches/[id].vue` | `layers/dashboard/app/pages/dashboard/batches/[id].vue` |

### Modified file (replace existing)

| File in this package | Path in your repo |
|---|---|
| `.../app/pages/dashboard/links.vue` | `layers/dashboard/app/pages/dashboard/links.vue` |

### Manual one-line edit (not a file in this package)

See `PATCH-link-schema.md` — add `batchId: z.string().optional()` to
`shared/schemas/link.ts`.

---

## What changed vs the first draft

The first version was written against assumptions that didn't match your repo.
This version corrects all of them:

- **Paths** now use the `app/` layer structure (`layers/dashboard/app/pages/dashboard/...`)
- **UI** rewritten from Nuxt UI components to plain HTML + your Tailwind tokens
  (so it themes via your shadcn-vue setup with no component-name guessing)
- **Data fetching** uses your `useAPI` composable (auth-aware), not raw `$fetch`
- **The links page is augmented, not replaced** — a view toggle switches between
  your existing `<DashboardLinks />` (untouched) and the new `<DashboardLinksTable />`
- **The bulk endpoint reuses your real link helpers** (`prepareIncomingLink`,
  `getLink`, `hashLinkPasswordForCreate`, `putLink`) so bulk links are identical
  to single-created ones — same slug generation, same KV key format
- **Detail links** use the query form `/dashboard/link?slug=...` to match `link.vue`

---

## Recommended commit order

1. **`shared/schemas/link.ts`** — add the `batchId` line first (PATCH-link-schema.md)
2. **`shared/types/batch.ts`** and the **server files** — the API endpoints
3. **The Vue files** — the table component, modified links page, and new pages

You can also commit everything in one drag-and-drop upload (drag the `server`,
`layers`, and `shared` folders into GitHub's "Upload files"). Just don't forget the
manual schema edit, which can't be uploaded as a whole-file replacement.

---

## Two assumptions to verify (both quick)

1. **KV access in the batch endpoints.** The batch endpoints read/write batch
   records via `event.context.cloudflare.env.KV`. The link helpers abstract this for
   links, so if your `putLink`/`getLink` utils use a different KV accessor, match it
   in the three files that reference `const { KV } = event.context.cloudflare.env`.
   (Note: the bulk endpoint creates the actual links via your helpers, so even if this
   accessor is off, links still create correctly — only the batch grouping record
   would need the tweak.)

2. **`putLink` persists the whole link object.** Covered in PATCH-link-schema.md —
   if it only writes specific fields, `batchId` won't save and we'll need a separate
   membership index.

If either is off, tell me what your link utils do and I'll adjust.

---

## Sidebar navigation (optional)

The new pages work by direct URL immediately. To add them to the sidebar, your sidebar
component is at `layers/dashboard/app/components/dashboard/sidebar/AppSidebar.vue`.
Paste that file's contents and I'll give you the exact lines to add (matching its
existing nav-item markup) — I don't want to guess its structure.

---

## After deploying

1. Visit `/dashboard/links` and toggle the new table/card view (works immediately,
   no new server code needed)
2. Visit `/dashboard/bulk-create`, create a small test batch (2–3 links)
3. Confirm the links redirect correctly, then check `/dashboard/batches` shows the batch
   and the detail page lists its links
