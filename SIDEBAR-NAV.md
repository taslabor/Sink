# Adding the "Batches" sidebar entry

Three small edits. The Bulk Create button on the Links page is already handled in
the updated `links.vue` (in the main package) — these three are for the sidebar nav.

---

## 1. Replace your `DASHBOARD_ROUTES` file

Replace the contents of the file where `DASHBOARD_ROUTES` is defined (the one you
pasted — likely `layers/dashboard/app/utils/dashboard-route.ts` or similar) with
`dashboard-routes-UPDATED.ts` from this package.

What changed:
- Added `Layers` and `Upload` to the lucide-vue-next import
- Added a `batches` route entry (`/dashboard/batches`, icon `Layers`)
- Added a `bulkCreate` route entry (`/dashboard/bulk-create`, icon `Upload`)

The `bulkCreate` entry isn't shown in the sidebar, but adding it means the dashboard
header shows a proper title on that page instead of the generic fallback.

---

## 2. Add "Batches" to the sidebar (`AppSidebar.vue`)

In `layers/dashboard/app/components/dashboard/sidebar/AppSidebar.vue`, find the
`platformItems` array and add this object right after the `links` item:

```ts
{
  title: 'nav.batches',
  url: '/dashboard/batches',
  icon: DASHBOARD_ROUTES.batches.icon,
  isActive: isActive('batches'),
},
```

So the start of the array becomes:

```ts
const platformItems = computed<NavItem[]>(() => [
  {
    title: 'nav.links',
    url: '/dashboard/links',
    icon: DASHBOARD_ROUTES.links.icon,
    isActive: isActive('links'),
  },
  {
    title: 'nav.batches',
    url: '/dashboard/batches',
    icon: DASHBOARD_ROUTES.batches.icon,
    isActive: isActive('batches'),
  },
  // ...analysis, realtime, check unchanged
])
```

---

## 3. Add the labels to your i18n locale(s)

The sidebar label comes from the `nav.batches` translation key. In your English
locale file (search the repo for `"links"` inside a `nav` block — likely
`i18n/locales/en.json` or `i18n/en.json`), add two keys to the existing `nav`
section:

```json
"nav": {
  "links": "Links",
  "batches": "Batches",
  "bulkCreate": "Bulk Create",
  "analysis": "Analysis",
  ...
}
```

(Use your file's existing values for the lines already there — just add the
`batches` and `bulkCreate` lines.)

If you support other languages, add the same two keys to those locale files too.
Any locale missing them will fall back to English (or show the key if no fallback is
configured), so English alone is enough to get it working.

---

## Note on the batch detail page

Because the route matching uses exact paths, the sidebar "Batches" item highlights on
the `/dashboard/batches` list page but not on an individual batch detail page
(`/dashboard/batches/<id>`), since that path is dynamic. This is purely cosmetic —
navigation still works. The existing `link` detail page has the same behaviour. If
you'd like the detail page to keep "Batches" highlighted, I can adjust the matching
logic to support path prefixes — just ask.
