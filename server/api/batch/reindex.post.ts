import type { BatchLinkRef } from '#server/utils/batch-index'
// POST /api/batch/reindex?cursor=...  → { done, cursor, scanned, indexed }
//
// One-time backfill for batches created before the membership index existed.
// Scans the link keyspace one page at a time, buckets each link's { id, slug }
// by its batchId, and appends them to batch_links:<batchId>. Cursor-driven:
// the client calls repeatedly until { done: true }. Safe to re-run — appends
// are deduped by id.

export default eventHandler(async (event) => {
  const { KV } = event.context.cloudflare.env
  const query = getQuery(event)
  const cursor = (query.cursor as string) || undefined
  const PAGE = 50

  const list = await KV.list({ prefix: 'link:', limit: PAGE, cursor })

  const buckets = new Map<string, BatchLinkRef[]>()
  await Promise.all(list.keys.map(async (key: { name: string }) => {
    const link = await KV.get(key.name, { type: 'json' }) as any
    if (link?.batchId && link.id) {
      if (!buckets.has(link.batchId))
        buckets.set(link.batchId, [])
      buckets.get(link.batchId)!.push({ id: link.id, slug: link.slug })
    }
  }))

  let indexed = 0
  for (const [batchId, refs] of buckets) {
    await addBatchLinkRefs(event, batchId, refs)
    indexed += refs.length
  }

  const done = list.list_complete
  return {
    done,
    cursor: done ? undefined : list.cursor,
    scanned: list.keys.length,
    indexed,
  }
})
