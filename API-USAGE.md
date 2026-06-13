# Adding links to a batch from automations (Make.com, scripts, etc.)

Links can be added to a batch progressively — across many requests, or one record
at a time — because each link stores its own `batchId`. The batch detail page picks
up everything tagged with that id, no matter how or when it was added.

All endpoints use the same bearer auth as the rest of the API:
`Authorization: Bearer <NUXT_SITE_TOKEN>`

## The workflow

### Step 1 — Create the batch once, capture its id

```
POST /api/batch
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Nightly import 2026-06-13", "comment": "from Make.com" }
```

Response:

```json
{ "id": "b1f2…", "name": "Nightly import 2026-06-13", "comment": "from Make.com", "createdAt": 1750000000, "count": 0 }
```

Store that `id`. In Make.com this is one module at the start of the scenario; the
returned `id` feeds the later steps.

### Step 2 — Add links to that batch, as many times as you like

Point every subsequent call at `/api/link/bulk` with the `batchId` instead of a
`batchName`. It works with one link or thousands:

```
POST /api/link/bulk
Content-Type: application/json
Authorization: Bearer <token>

{
  "batchId": "b1f2…",
  "links": [
    { "url": "https://example.com/a", "slug": "promo-a" },
    { "url": "https://example.com/b" }
  ]
}
```

Single-record automations (one link per run) use the exact same call with a
one-item `links` array:

```json
{ "batchId": "b1f2…", "links": [ { "url": "https://example.com/x" } ] }
```

Each call appends, stamps `batchId` on the new links, and bumps the batch count.

## Per-link options

Every field the normal create endpoint accepts works here too, per link:

```json
{
  "batchId": "b1f2…",
  "links": [
    {
      "url": "https://example.com/sale",
      "slug": "sale",
      "comment": "spring promo",
      "expiration": 1767225600,
      "password": "secret",
      "redirectWithQuery": true
    }
  ]
}
```

`expiration` is a unix timestamp in **seconds**, and must be at least ~60 seconds in
the future (a Cloudflare KV requirement).

## Response shape

```json
{
  "batch": { "id": "b1f2…", "name": "…", "count": 42 },
  "added": 2,
  "results": [
    { "url": "https://example.com/a", "slug": "promo-a", "success": true },
    { "url": "https://example.com/b", "slug": "Xa3kP", "success": true }
  ]
}
```

`results` reports per-link success/failure (e.g. a slug collision fails just that one
link without aborting the rest), and `added` is how many succeeded in this call.

## A note on the count under heavy concurrency

The batch `count` is updated with a read-then-write, which isn't atomic in KV. If many
requests append to the same batch at the exact same moment, the at-a-glance count on
the batches list can drift slightly. The batch **detail** page counts exactly by
scanning, so it's always accurate — only the list-page number is approximate, and only
under truly concurrent writes. If your automations fan out in parallel against one
batch and you need an always-exact list count, tell me and I'll switch the batch to a
membership-index design.
